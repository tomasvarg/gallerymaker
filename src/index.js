/* global Promise */

var fs = require('fs');
var path = require('path');
var util = require('util');
var sharp = require('sharp');

var utils = require('./utils.js');

var cmd = process.argv[2]
var idir = process.argv[3];
var odir = sanitize(process.argv[4] || idir + '.web');

var clientDir = path.join(__dirname, 'client');

var conf = {
    width: 700,
    quality: 80,
    debug: true,
    template: 'index.html'
};
var EOL = "\n";
var DEPTH = 2;
var SORT_DESC = true;

var log = conf.debug ? console.log.bind(console) : function () {};
var logi = function () {
    arguments[0] = utils.indent(arguments[0]).substr(1); // substr bcx console.log adds another space
    return log.apply(this, !arguments[0] ? Array.prototype.slice.call(arguments, 1) : arguments);
};
var ind = depth => utils.indent(depth, DEPTH);

var cmds = {
    prepare: prepareImages,
    list: generateList,
    gallery: generateGallery,
    all: () => {
        prepareImages()
        .then(cont => Promise.all([
            generateList(cont),
            generateGallery(cont)
        ]))
        .then(res => log('All tasks finished!', res.map(r => { return { type: typeof r, lenght: r.length }; })));
    }
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
    cmds[cmd]();
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
            .then(() => {
                return { file: fname, name: name };
            }, err => {
                console.log('Resizing "' + file + '" ' + err);
                return new Promise((resolve) => {
                    var rs = fs.createReadStream(path.join(srcDir, file));
                    var ws = fs.createWriteStream(path.join(destDir, fname));
                    ws.on('error', e => {
                        resolve({ file: '', name: name, error: 'Writing file failed: ' + e + '; ' + err });
                    });
                    rs.on('end', () => {
                        resolve({ file: fname, name: name, error: '' + err });
                        ws.end();
                    });
                    rs.pipe(ws, { end: false });
                });
            });
    })
    .then(cont => {
        log('Image preparation done!');
        return utils.writeFile(JSON.stringify(cont), 'content.json', odir);
    })
    .then(cont => {
        log('Content:', util.inspect(cont, { showHidden: false, depth: null }));
        return cont;
    })
    .catch(err => {
        console.log(err);
        process.exit();
    });
}

function generateList(cont) {
    log('Generating file list');

    return getContent(cont)
    .then(cont => {
        //log('content:', util.inspect(cont, { showHidden: false, depth: null }));
        return cont
    })
    .then(cont => getListEntryHtml(cont.cont))
    .then(html => getPageHtml(html))
    .then(html => Promise.all([
        utils.writeFile(html, 'list.html', odir),
        utils.copyFile(clientDir, 'index.css', odir),
        utils.copyFile(clientDir, 'index.js', odir)
    ]))
    .then(res => {
        log('Generated files:', res);
        return res[0];
    })
    .catch(err => {
        console.log(err);
        process.exit();
    });
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

function getPageHtml(htmlPart, pageFname) {
    pageFname = pageFname || conf.template;
    return new Promise((resolve, reject) => {
        var pageFile = path.join(clientDir, pageFname);
        fs.readFile(pageFile, 'utf-8', (err, data) => {
            if (err) reject(err);
            else if (!data) reject('File empty: ' + pageFile);
            resolve(data);
        });
    })
    .then((pageHtml) => {
        return pageHtml.substring(0, pageHtml.search('[ ]*</body>')) + htmlPart
            + pageHtml.substr(pageHtml.search('[ ]*</body>'));
    });
}

function generateGallery(cont) {
    log('Generating gallery');

    return getContent(cont)
    .then(cont => getGalleryEntryHtml(cont.cont))
    .then(cont => {
        log('Gallery prepared!');
        log('content:', util.inspect(cont, { showHidden: false, depth: null }));
        return cont;
    });
}

function getGalleryEntryHtml(cont) {

    var html = '';
    cont.forEach(item => {
    });

    return html;
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

    return new Promise((resolve, reject) => fs.readdir(dir, (err, files) => {
        if (err) reject('Reading directory "' + dir + '" failed: ' + err);
        //logi(depth, '[dir]', dir.replace(/^.*\//, ''));

        var destDir = dir === idir ? odir : path.join(odir, sanitize(dir.replace(idir, '')));
        if (!nomkdir && files.length && !fs.existsSync(destDir)) {
            logi(depth, '[mkdir]', destDir);
            fs.mkdirSync(destDir);
        }

        if (SORT_DESC)
            files.reverse();

        return Promise.all(files.map(file => {
            return new Promise((resolve) => fs.stat(path.join(dir, file), (err, stat) => {
                if (stat.isDirectory())
                    resolve(mirrorDirTree(path.join(dir, file), cb, nomkdir, depth));
                else if (typeof cb === 'function')
                    resolve(cb(file, dir, destDir, depth + 1));
            }));
        }))
        .then(items => {
            logi(depth, 'finished:');
            items.forEach(item => logi(depth + 1, item.error ? '[error] ' + item.file + ' ' + item.error
                : item.file ? '[file] ' + item.file : item.dir ? '[dir] ' + item.dir : item));
            resolve({ dir: destDir.replace(/^.*\//, ''), name: dir.replace(/^.*\//, ''), cont: items });
        });
    }));
}

function getContent(cont) {
    return new Promise((resolve, reject) => {
        if (cont) resolve(cont);
        else
            fs.readFile(path.join(odir, 'content.json'), (err, data) => {
                if (err) reject(err);
                else if (!data) reject('File empty: ' + path.join(odir, 'content.json'));
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(path.join(odir, 'content.json') + ' parsing failed: ' + e); }
            });
    })
    .catch(err => {
        console.log('Content reading failed: ' + err + '; Re-reading directory tree');
        return mirrorDirTree(odir, file => { return { file: file }; }, true);
    })
}

function sanitize(path) {
    return utils.diaStrip(path).replace(/\ /g, '_')
        .replace(/([.][^.]*)$/, match => String.prototype.toLowerCase.call(match));
}
