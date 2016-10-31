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
var nodeModDir = path.join(__dirname, '..', 'node_modules');

var conf;
try { conf = require(path.join(__dirname, '..', 'config.json')); }
catch (e) { conf = {}; }
if (!conf.width) conf.width = 800;
if (!conf.quality) conf.quality = 80;
if (!conf.thumb_width) conf.thumb_width = 100;
if (!conf.thumb_quality) conf.thumb_quality = 70;
if (!conf.list) conf.list = {};
if (!conf.list.sort_desc) conf.list.sort_desc = false;
if (!conf.gallery) conf.gallery = {};
if (!conf.gallery.years_desc) conf.gallery.years_desc = true;
if (!conf.gallery.files_first) conf.gallery.files_first = true;
if (!conf.fnames) conf.fnames = {}; // odir
if (!conf.fnames.list) conf.fnames.list = 'list.html';
if (!conf.fnames.gallery) conf.fnames.gallery = 'gallery.html';
if (!conf.templates) conf.templates = {}; // clientDir
if (!conf.templates.index) conf.templates.index = 'index.html';
if (!conf.assets) conf.assets = {};
if (!conf.assets.common) conf.assets.common = [
    { sdir: clientDir, fname: 'index.js', ddir: odir + '/lib' },
    { sdir: clientDir, fname: 'index.css', ddir: odir + '/lib' },
];
if (!conf.assets.gallery) conf.assets.gallery = [
    { sdir: nodeModDir + '/jsonlylightbox/js', fname: 'lightbox.js', ddir: odir + '/lib' },
    { sdir: nodeModDir + '/jsonlylightbox/css', fname: 'lightbox.css', ddir: odir + '/lib' },
];
if (!conf.ignored_files || !conf.ignored_files.push) conf.ignored_files = [];
if (conf.debug === undefined) conf.debug = false;

for (var ak in conf.assets) conf.ignored_files.push.apply(conf.ignored_files, conf.assets[ak].map(a => a.fname));
for (var fk in conf.fnames) conf.ignored_files.push(conf.fnames[fk]);

var EOL = conf.eol ? conf.eol : "\n";
var DEPTH = conf.html_init_depth ? conf.html_init_depth : 2;
var IMG_TYPES = ['jpeg', 'jpg', 'png', 'gif'];

var log = conf.debug ? console.log.bind(console) : function () {};
var logi = function () {
    arguments[0] = utils.indent(arguments[0]).substr(1); // substr bcx console.log adds another space
    return log.apply(this, !arguments[0] ? Array.prototype.slice.call(arguments, 1) : arguments);
};
var ind = depth => utils.indent(depth, DEPTH);

var cmds = {
    prepare: () => prepareImages().then(() => copyAssets('common')),
    list: generateList,
    gallery: generateGallery,
    all: () => prepareImages()
        .then(cont => Promise.all([
            copyAssets('common'),
            ['content.json'].concat(cont.cont.map(c => c.dir)),
            generateList(cont),
            generateGallery(cont),
            copyAssets('gallery')
        ]))
        .then(res => log('All tasks done! Files:', res.reduce((c, n) => c.concat(n), []).join(', ')))
};

if (!cmd || !idir) {
    var help = [
        'Usage: gallerymaker <command> <source dir> [<destination dir>]',
        '',
        '  <dest dir> defaults to sanitized <source dir> + ".web" if not provided.',
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
    log('Preparing content')

    return mirrorDirTree(idir, (file, srcDir, destDir) => {
        var fname = sanitize(file);
        var name = file.replace(/[.][^.]*$/, '');
        var extMatch = file.match(/^.*[.]([^.]*)$/);
        var ext = extMatch && extMatch[1] ? extMatch[1].toLowerCase() : null;

        return sharp(path.join(srcDir, file))
        .resize(conf.width)
        .quality(conf.quality)
        .toFile(path.join(destDir, fname))
        .then(() => ({ file: fname, ext: ext, name: name }))
        .catch(sharpErr => utils.copyFile(srcDir, file, destDir, fname)
            .then(() => ({ file: fname, ext: ext, name: name, warn: '' + sharpErr }))
            .catch(writeErr => ({ file: '', ext: ext, name: name, error: writeErr }))
        );
    })
    .then(cont => utils.writeFile(cont, 'content.json', odir))
    .then(cont => {
        //log('Preparing images done. Content:', util.inspect(cont, { showHidden: false, depth: null }));
        console.log('Preparing content done:', ['content.json'].concat(cont.cont.map(c => c.dir)).join(', '));
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
        console.log('Generating file list done:', res.join(', '));
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
        console.log('Generating gallery done:', files.join(', '));
        return files;
    });
}

function copyAssets(asskey) {
    log('Copying', asskey, 'assets');
    var ass = conf.assets[asskey] ? conf.assets[asskey] : asskey && asskey.map ? asskey : [];

    return Promise.all(ass.map(a => {
        if (!fs.existsSync(a.ddir)) fs.mkdirSync(a.ddir);
        return utils.copyFile(a.sdir, a.fname, a.ddir);
    }))
    .then(files => {
        console.log('Copying', asskey, 'assets done:', files.join(', '));
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
            : item.warn ? '[warn] ' + item.file + ' ' + item.warn
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
    var rootClass = depth === 0 ? ' list' : '';
    var html = '';

    if (!conf.list.sort_desc)
        cont.reverse();

    cont.forEach(it => {
        var key = it.dir ? 'dir' : 'file';
        html += ind(depth) + '<div class="' + key + rootClass + '" data-level="' + depth + '"'
                + (key === 'file' && it.name ? ' title="' + it.name + '"' : '') + '>' + EOL
            + (it.dir ? ind(depth +1) + '<div class="name"'
                + (it.name ? ' title="' + it.name + '"' : '') + '>' + it[key] + '</div>' + EOL : '')
            + (it.cont ? getListEntryHtml(it.cont, dir ? path.join(dir, it.dir) : it.dir, depth +1)
                : ind(depth +1) + '<a href="' + (dir ? path.join(dir, it[key]) : it[key]) + '">'
                    + it[key] + '</a>' + EOL)
            + ind(depth) + '</div>' +  EOL
    });

    return html;
}

function getGalleryEntryHtml(cont, dir, depth) {
    depth = depth === undefined ? 0 : depth;
    var rootClass = depth === 0 ? ' gallery' : '';
    var htag = depth + 1 <= 6 ? 'h' + (depth + 1) : 'div'
    var html = '';
    var rxYear = /^[0-9]{4}/;

    if (conf.gallery.years_desc)
        cont = cont.filter(it => rxYear.test(it.name))
                .concat(cont.filter(it => !rxYear.test(it.name)).reverse());

    if (conf.gallery.files_first)
        cont = cont.filter(it => it.file).concat(cont.filter(it => !it.file));

    cont.forEach(it => {
        var key = it.dir ? 'dir' : 'file';
        var isImg = IMG_TYPES.indexOf(it.ext) !== -1;
        var className = (isImg ? 'img' : key) + rootClass;

        html += ind(depth) + '<div class="' + className + '" data-level="' + depth + '">' + EOL
            + (it.dir ? ind(depth +1) + '<a name="' + it[key] + '"></a>' + EOL : '')
            + (it.dir ? ind(depth +1) + '<' + htag + ' class="name">' + it.name + '</' + htag + '>' + EOL : '')
            + (it.cont ? getGalleryEntryHtml(it.cont, dir ? path.join(dir, it.dir) : it.dir, depth +1)
                : ind(depth +1) + '<a href="' + (dir ? path.join(dir, it[key]) : it[key]) + '"'
                    + ' title="' + it.name + '">'
                    + (isImg ? EOL + ind(depth +2)
                            + '<img src="' + (dir ? path.join(dir, it[key]) : it[key]) + '"'
                            + ' width="' + conf.thumb_width + '"'
                            + ' data-jslghtbx data-jslghtbx-group="' + dir + '"'
                            + ' data-jslghtbx-caption="' + it.name + '"'
                            + ' />'
                        : it.name + (it.ext ? ' [' + it.ext + ']' : ''))
                + '</a>' + EOL)
            + ind(depth) + '</div>' + EOL
    });

    return html;
}
