/* global Promise */

var fs = require('fs');
var path = require('path');
//var util = require('util');
var sharp = require('sharp');

var utils = require('./utils.js');

var cmd = process.argv[2]
var idir = process.argv[3];
var odir = sanitize(process.argv[4] || idir + '.web');

var clientDir = path.join(__dirname, 'client');

var conf;
try { conf = require(path.join(__dirname, '..', 'config.json')); }
catch (e) { conf = {}; }
if (!conf.width) conf.width = 700;
if (!conf.quality) conf.quality = 80;
if (!conf.fnames) conf.fnames = {}; // odir
if (!conf.fnames.list) conf.fnames.list = 'list.html';
if (!conf.fnames.gallery) conf.fnames.gallery = 'gallery.html';
if (!conf.templates) conf.templates = {}; // clientDir
if (!conf.templates.index) conf.templates.index = 'index.html';
if (!conf.assets) conf.assets = {}; // clientDir
if (!conf.assets.common) conf.assets.common = ['index.js', 'index.css'];
if (!conf.ignored_files || !conf.ignored_files.push) conf.ignored_files = [];
if (conf.debug === undefined) conf.debug = true;

for (var ak in conf.assets) conf.ignored_files.push.apply(conf.ignored_files, conf.assets[ak]);
for (var fk in conf.fnames) conf.ignored_files.push(conf.fnames[fk]);

var EOL = conf.eol ? conf.eol : "\n";
var DEPTH = conf.html_init_depth ? conf.html_init_depth : 2;
var SORT_DESC = conf.sort_desc ? conf.sort_desc : true;

var log = conf.debug ? console.log.bind(console) : function () {};
var logi = function () {
    arguments[0] = utils.indent(arguments[0]).substr(1); // substr bcx console.log adds another space
    return log.apply(this, !arguments[0] ? Array.prototype.slice.call(arguments, 1) : arguments);
};
var ind = depth => utils.indent(depth, DEPTH);

var cmds = {
    prepare: () => prepareImages().then(copyAssets('common')),
    list: generateList,
    gallery: generateGallery,
    all: () => prepareImages()
        .then(cont => Promise.all([
            copyAssets('common'),
            ['content.json'].concat(cont.cont.map(c => c.dir)),
            generateList(cont),
            generateGallery(cont)
        ]))
        .then(res => log('All tasks finished! Files:', res.reduce((c, n) => c.concat(n), []).join(', ')))
};

if (!cmd || !idir) {
    var help = [
        'Usage: gallerymaker <command> <source dir> [<destination dir>]',
        '',
        '  <dest dir> will be sanitized <source dir> + ".web" suffix if not provided.',
        '',
        'Commands:',
        '  prepare       Prepares gallery file structure based on the <source dir>',
        '                with sanitized names and resized images (see config.json for',
        '                conversion settings) in <destination dir>;',
        '                creates contents.json with original to sanitized names map',
        '                as a source for image captions.',
        '  list          Prepares gallery contents list html (list.html).',
        '  gallery       Prepares gallery contents html (gallery.html).',
        '  all           Runs all the commands (with proper chaning - prepare first).'
    ];
    console.log(help.join("\n"));
    process.exit();
}
else if (!cmds[cmd]) {
    console.log('Unknown command "' + cmd + '"; supported commands: prepare, list, gallery, all');
    process.exit();
}
else {
    cmds[cmd]()
    .catch(err => {
        console.log(err);
        process.exit();
    });
}

function prepareImages() {
    log('Preparing images - recreating gallery directories with sanitized names and resized images')

    return mirrorDirTree(idir, (file, srcDir, destDir) => {
        var fname = sanitize(file);
        var name = file.replace(/[.][^.]*$/, '');

        return sharp(path.join(srcDir, file))
        .resize(conf.width)
        .quality(conf.quality)
        .toFile(path.join(destDir, fname))
        .then(() => ({ file: fname, name: name }))
        .catch(sharpErr => utils.copyFile(srcDir, file, destDir, fname)
            .then(() => ({ file: fname, name: name, error: '' + sharpErr }))
            .catch(writeErr => ({ file: '', name: name, error: writeErr }))
        );
    })
    .then(cont => utils.writeFile(cont, 'content.json', odir))
    .then(cont => {
        //log('Preparing images finished. Content:', util.inspect(cont, { showHidden: false, depth: null }));
        log('Preparing images finished:', ['content.json'].concat(cont.cont.map(c => c.dir)).join(', '));
        return cont;
    });
}

function generateList(cont) {
    log('Generating file list');

    return getContent(cont)
    .then(cont => getListEntryHtml(cont.cont))
    .then(html => getPageHtml(html, conf.templates.index))
    .then(html => Promise.all([
        utils.writeFile(html, conf.fnames.list, odir, true)
    ]))
    .then(res => {
        log('Generating file list finished:', res.join(', '));
        return res;
    });
}

function generateGallery(cont) {
    log('Generating gallery');

    return getContent(cont)
    .then(cont => getGalleryEntryHtml(cont.cont))
    .then(html => getPageHtml(html, conf.templates.index))
    .then(html => Promise.all([
        utils.writeFile(html, conf.fnames.gallery, odir, true)
    ]))
    .then(files => {
        log('Generating gallery finished:', files.join(', '));
        return files;
    });
}

function copyAssets(asskey) {
    log('Copying', asskey, 'assets');
    var fnames = conf.assets[asskey] ? conf.assets[asskey] : asskey && asskey.map ? asskey : [];

    return Promise.all(fnames.map(fname => utils.copyFile(clientDir, fname, odir)))
    .then(files => {
        log('Copying', asskey, 'assets finished:', files.join(', '));
        return files;
    });
}

/**
 * Creates sanitized mirror of a directory tree and grants access to its files
 *
 * @param {string} dir Path of the directory to be processed
 * @param {function({string}, {string}, {string})} cb(file, srcDir, destDir) File transformator
 * @param {boolean} nomkdir Disable (sanitized) mkdir of the directory being processed
 * @param {int} [depth=0] Indents log messages according to an actual depth
 * @returns {void}
 */
function mirrorDirTree(dir, cb, nomkdir, depth) {
    depth = depth === undefined ? 0 : depth += 1;
    var destDir = dir === idir ? odir : path.join(odir, sanitize(dir.replace(idir, '')));

    return new Promise((resolve, reject) => fs.readdir(dir, (err, files) => {
        if (err) reject('Reading directory "' + dir + '" failed: ' + err);
        if (files === undefined) reject('Directory "' + dir +'" does not exist!');
        if (files.length && !fs.existsSync(destDir) && !nomkdir) fs.mkdirSync(destDir);
        if (files.filter) files = files.filter(file => conf.ignored_files.indexOf(file) === -1);
        if (SORT_DESC) files.reverse();
        resolve(files);
    }))
    .then(files => Promise.all(files.map(file =>
        new Promise((resolve, reject) => fs.stat(path.join(dir, file), (err, stat) => {
            if (stat.isDirectory())
                resolve(mirrorDirTree(path.join(dir, file), cb, nomkdir, depth));
            else if (typeof cb === 'function')
                resolve(cb(file, dir, destDir, depth + 1));
            else
                reject('No file processing callback provided.');
        }))
    )))
    .then(items => {
        logi(depth, '[dir]', dir);
        items.forEach(item => logi(depth + 1, item.error ? '[error] ' + item.file + ' ' + item.error
            : item.file ? '[file] ' + item.file : item.dir ? '[dir] ' + item.dir : item));
        return { dir: destDir.replace(/^.*\//, ''), name: dir.replace(/^.*\//, ''), cont: items };
    });
}

function getContent(cont) {
    return new Promise((resolve, reject) => {
        if (cont) resolve(cont);
        fs.readFile(path.join(odir, 'content.json'), (err, data) => {
            if (err) reject(err);
            else if (!data) reject('File empty: ' + path.join(odir, 'content.json'));
            try { resolve(JSON.parse(data)); }
            catch (e) { reject(path.join(odir, 'content.json') + ' parsing failed: ' + e); }
        });
    })
    .catch(err => {
        console.log('Content cache reading failed: ' + err + '; Re-reading directory tree');
        return mirrorDirTree(odir, file => ({ file: file }), true);
    })
}

function sanitize(path) {
    return utils.diaStrip(path).replace(/\ /g, '_')
        .replace(/([.][^.]*)$/, match => String.prototype.toLowerCase.call(match));
}

function getPageHtml(htmlPart, pageFname) {
    var pageFile = path.join(clientDir, pageFname);

    return new Promise((resolve, reject) => fs.readFile(pageFile, 'utf-8', (err, data) => {
        if (err) reject(err);
        else if (!data) reject('File empty: ' + pageFile);
        resolve(data);
    }))
    .then((pageHtml) => pageHtml.substring(0, pageHtml.search('[ ]*</body>'))
        + htmlPart + pageHtml.substr(pageHtml.search('[ ]*</body>')));
}

function getListEntryHtml(cont, dir, depth) {
    depth = depth === undefined ? 0 : depth;

    var html = '';
    cont.forEach(item => {
        var key = item.dir ? 'dir' : 'file';
        html += ind(depth) + '<div class="' + key + '" data-level="' + depth + '">' + EOL
            + (item.dir ? ind(depth +1) + '<div class="name">' + (item.name || item[key]) + '</div>' + EOL : '')
            + (item.cont ? getListEntryHtml(item.cont, dir ? path.join(dir, item.dir) : item.dir, depth +1)
                : ind(depth +1) + '<a href="' + (dir ? path.join(dir, item[key]) : item[key]) + '">'
                    + (item.name || item[key]) + '</a>' + EOL)
            + ind(depth) + '</div>' +  EOL
    });

    return html;
}

function getGalleryEntryHtml(cont) {

    var html = '';
    cont.forEach(item => {
    });

    return html;
}
