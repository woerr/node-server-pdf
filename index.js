var app = require('express')(),
    bodyParser = require('body-parser'),
    mkdirp = require('mkdirp'),
    http = require('http').Server(app),
    server,
    fs = require('fs'),
    wkhtmltopdf = require('wkhtmltopdf'),
    sha256 = require('sha256'),
    pdftk = require('node-pdftk');
// multer = require('multer'); // v1.0.5
// upload = multer(); // for parsing multipart/form-data;
formidable = require('formidable');
// JSZip = require('jszip');
var cacheFiles = {};

var updateCache = function () {
    fs.writeFile('cache_files.json', JSON.stringify(cacheFiles), function (err) {
        if (!err);
    });
};

var getFilesCache = function () {
    fs.readFile('cache_files.json', function (err, rawdata) {
        if (!err)
            cacheFiles = JSON.parse(rawdata);
    });
};
getFilesCache();


const path = require('path');

var WBDriveData = {
    login: 'Node_Pdf_Generator',
    pwd: 'f6b7895fcb63a3d9bbf7301520014fe0',
    folderId: 15,
    url: 'http://tobolsk.weldbook.ru/WBDrive/op/op.AddDocumentXDomain.php'
};

var cfg = {
    timer: 60 * 1000,
    saveDir: "/documents/pdf/",
    fullSaveDir: __dirname + "/documents/pdf/",
};


/**
 * Парсер formData (не сделан парсинг файлов, скорее всего будет падать из-за нехватки оперы)
 * @param req
 * @param res
 * @param next
 */
// var formDataParse = function (req, res, next) {
//
//     try {
//         var boundaryRe = /\s*(?:Content-Type:)*\s*multipart\/form-data;\s*boundary\s*=\s*(.*)/i;
//         var boundaryRaw = '' + req.headers['content-type'];
//         var boundary = boundaryRaw.match(boundaryRe);
//         boundary = boundary[1] || boundary;
//
//         var rawBody = '';
//         req.setEncoding('utf8');
//
//         var parse = function (rawBody) {
//             var reBody = new RegExp('--' + boundary + '-{0,2}');
//             var reName = /(?:Content-Disposition:\s*form-data;)*[\s\r\n]*name="([a-z0-9_-]*)"/i;
//             var _bodyes = ('' + rawBody).split(reBody);
//             req.formData = {};
//             for (var item in _bodyes) {
//                 var _body = ('' + _bodyes[item]).match(reName);
//                 if (_body && _body[1]) req.formData[_body[1]] = ('' + _bodyes[item]).replace(reName, '').trim();
//             }
//             next();
//         };
//
//         req.on('data', function (chunk) {
//             rawBody += chunk;
//         });
//
//         req.on('end', function () {
//             parse(rawBody);
//         });
//     } catch (e) {
//         next();
//     }
//
// };
// app.use(formDataParse);
app.use(bodyParser.urlencoded({extended: true, limit: '100mb'})); // for parsing application/x-www-form-urlencoded
app.use(bodyParser.json()); // for parsing application/json

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

var queryCreatePdf = function (req, res, next) {
    var cfg;
    var file;
    if (req.params.cfg) cfg = JSON.parse(req.params.cfg);
    var pdfCreator = new PdfCreator();
    var createPdf = function (reqData) {
        var creatorCfg = reqData;
        var cryptCfg = sha256(JSON.stringify(creatorCfg));// hash Конфига
        if (file = getFileFromList(cryptCfg)) {
            // console.log('Cache is working - '+file.name);
            res.redirect(req.protocol + '://' + req.get('host') + '/getPdf/' + path.basename(file.name)+((cfg&&cfg.userFilename)?('/'+cfg.userFilename):''));
        }
        else pdfCreator.create(creatorCfg)
        // pdfCreator.create({html:'<div>Test html <span>по русски</span></div>'})
            .then(function (pdf) {
                // pdf.path = pdf.path.replace('./','');
                // res.send(pdf);
                res.redirect(req.protocol + '://' + req.get('host') + '/getPdf/' + path.basename(pdf.path)+((cfg&&cfg.userFilename)?('/'+cfg.userFilename):''));
                // res.sendFile(pdf.path, {root: __dirname});
            })
            .catch(function (e) {
                res.send({e: e});
            });
    };
    if (req._body) {
        console.log(new Date()+'got url encode');
        createPdf(req.body);
    }
    else {
        console.log(new Date()+'got formdata');
        var form = new formidable.IncomingForm();
        var formData;
        form.parse(req, function (err, fields, files) {
            formData = fields;
            createPdf(formData);
        });
    }
};

var sendFile = function (fileName, response,userFilename) {
    const filePath = __dirname + fileName;
    var filename='';
    if (userFilename)
        filename=userFilename;
    else
        filename=path.basename(fileName);
    // Check if file specified by the filePath exists
    fs.exists(filePath, function (exists) {
        if (exists) {
            // Content-type is very interesting part that guarantee that
            // Web browser will handle response in an appropriate manner.
            response.writeHead(200, {
                "Content-Disposition": "inline; filename=\"" + filename  + "\""
            });
            fs.createReadStream(filePath).pipe(response);
        } else {
            response.writeHead(400, {"Content-Type": "text/plain"});
            response.end("ERROR File" + filePath + " does not exist");
        }
    });
};

var queryGetPdf = function (req, res, next) {
    var fileName = req.params.filename || '';
    var userFileName=req.params.customName;
    var dir = cfg.saveDir;
    var path = dir + fileName;
    sendFile(path, res,userFileName);
};

var queryTestCreatePdf = function (req, res, next) {
    var cfg;
    var file;
    var paramsTranslator = {
        'sheet-size': 'pageSize',
        'margin-left': 'marginLeft',
        'margin-right': 'marginRight',
        'margin-top': 'marginTop',
        'margin-bottom': 'marginBottom'
    };
    if (req.params.cfg) cfg = JSON.parse(req.params.cfg);
    var translateSettings = function(arr){
        var settings=[];
        var keys=Object.keys(arr);
        var values=Object.values(arr);
        keys.forEach(function (k,i) {
            if (k == 'sheet-size'||k == 'pdf_format'||k == 'pageSize') {
                if(paramsTranslator[keys[i] ])
                    settings[paramsTranslator[keys[i] ]] = values[i].match(/(\w+)/gi)[0];
                else
                    settings[keys[i] ] = values[i].match(/(\w+)/gi)[0];

                if (values[i].match(/(\w+)/gi).length > 1)
                    if (values[i].match(/(\w+)/gi)[1] == 'L')
                        settings['orientation'] = 'Landscape';
                    else settings['orientation'] = 'Portrait';
            }
            else {
                if(paramsTranslator[keys[i] ])
                settings[paramsTranslator[keys[i] ]] = values[i];
                else
                    settings[keys[i] ] = values[i];
            }
        });
        return settings;
    };
    var createPdf = function (reqData) {
        var creatorCfg = reqData;
        var globalSettings = {};
        var cfg = creatorCfg;
        globalSettings.marginLeft = cfg.marginLeft || cfg.leftSize || '12mm';
        globalSettings.marginTop = cfg.marginTop || cfg.headerSize || '12mm';
        globalSettings.marginRight = cfg.marginRight || cfg.rightSize || '8mm';
        globalSettings.marginBottom = cfg.marginBottom || cfg.footerSize || '13mm';
        // globalSettings.marginLeft = globalSettings.marginLeft - 2;
        // globalSettings.marginRight = globalSettings.marginRight - 2;
        globalSettings.orientation = cfg.orientation || 'Portrait';
        globalSettings.encoding = cfg.encoding || 'utf-8';
        var defaultFontSize = cfg.defaultFontSize || '13px';
        var defaultFontFamily = cfg.fontFamily || 'verdana';
        var boxSizing = "border-box";
        globalSettings.pageSize = cfg.pdf_format || 'A4';
        var html = creatorCfg.pdf_html||creatorCfg.html;
        var customStyle = "<style> div,table {page-break-inside: avoid;box-sizing: " + boxSizing + ";font-size: " + defaultFontSize + ";font-family: " + defaultFontFamily + "}</style>";
        var pages = html.split(/<pagebreak.*<\/pagebreak>/);
        var pageBreakers = html.match(/(<pagebreak .+<\/pagebreak>)/g);
        pages = pages.map(function (v) {
            return customStyle + v;
        });
        if(pageBreakers)
        var pageSettings = pageBreakers.map(function (t, number) {
            var pb = t.match(/((\S+)="(\S+)")/gi);
            var settings = {};
            pb.forEach(function (v) {
                var row = v.split('=');
                if (row[0] == 'sheet-size') {
                    settings[paramsTranslator[row[0]]] = row[1].match(/(\w+)/gi)[0];
                    if (row[1].match(/(\w+)/gi).length > 1)
                        if (row[1].match(/(\w+)/gi)[1] == 'L')
                            settings['orientation'] = 'Landscape';
                        else settings['orientation'] = 'Portrait';
                }
                else {
                    settings[paramsTranslator[row[0]]] = row[1].substr(1, row[1].length - 2);
                }
            });
            return settings;
        });
        else pageSettings=[];
        var testdir = 'testpdf/';
        var docdir = path.basename(creatorCfg.filename, '.pdf');
        var createdFolder = testdir + docdir;
        globalSettings=translateSettings(globalSettings);
        fs.access(createdFolder, function (err) {
            if (!err) {
                console.log('exist');
                fs.rmdir(createdFolder, function () {
                    fs.mkdir(createdFolder, function () {
                        createBuffersArray(pages.length - 1);
                    });
                });
            } else {
                fs.mkdir(createdFolder, function () {
                    console.log('not exist');
                    createBuffersArray(pages.length - 1);
                });
            }
        });
        function createBuffersArray(i) {
            if (i < -40)return false;
            if (i < 0) {

                    fs.readdir(createdFolder, function (err, files) {
                        if((!files)||(files.length<pages.length)){
                        console.log('try - '+ (-i));
                        setTimeout(function(){createBuffersArray(i - 1)},50);
                        return
                    }
                        files.sort(function (a, b) {
                            return a.match(/\d+/) - b.match(/\d+/);
                        });
                        files = files.map(function (t) {
                            return createdFolder + '/' + t;
                        });
                        console.log(files);
                        pdftk.input(files)
                            .output()
                            .then(function (buf) {
                                files.forEach(function (f) {
                                    console.log('file' + f +' deleted')
                                    fs.unlinkSync(f)
                                });
                                fs.rmdirSync(createdFolder);
                                console.log('createdFolder - ' +createdFolder +' deleted')

                                res.type('application/pdf'); // If you omit this line, file will download
                                res.send(buf);
                            })
                            .catch(next);
                    });
                    return true;
            }
            else {
                if (pageSettings[i - 1]) {
                    var settings = pageSettings[i - 1];
                    settings.marginLeft = settings.marginLeft + 'px';
                    settings.marginTop = settings.marginTop + 'px';
                    settings.marginRight = settings.marginRight + 'px';
                    settings.marginBottom = settings.marginBottom + 'px'
                }

                else
                    var settings = {};
                new Promise(function (resolve) {
                    var outPath = createdFolder + '/' + i + '.pdf';
                    wkhtmltopdf(pages[i], {
                        output: outPath,
                        encoding: settings.encoding || globalSettings.encoding,
                        noPdfCompression: true,
                        pageSize: settings.pageSize || globalSettings.pageSize,
                        orientation: settings.orientation || globalSettings.orientation,
                        marginLeft: settings.marginLeft || globalSettings.marginLeft,
                        marginTop: settings.marginTop || globalSettings.marginTop,
                        marginRight: settings.marginRight || globalSettings.marginRight,
                        marginBottom: settings.marginBottom || globalSettings.marginBottom,
                        disableSmartShrinking: true
                    }, function (e) {
                        resolve();
                    })
                }).then(createBuffersArray(i - 1));

            }

        }
    };
    if (!req.body) {
        var form = new formidable.IncomingForm();
        var formData;
        form.parse(req, function (err, fields, files) {
            formData = fields;
            createPdf(formData);
        });
    }
    else {
        createPdf(req.body);
    }
};

app.post('/createPdf/:cfg?', queryCreatePdf);
app.post('/testCreatePdf/:cfg?', queryTestCreatePdf);
app.get('/testCreatePdf/:cfg?', queryTestCreatePdf);
app.get('/createPdf/:cfg?', queryCreatePdf);
app.get('/getPdf/:filename?/:customName?', queryGetPdf);

server = http.listen(8080); // Запуск сервера.
console.log("Сервер запущен http://localhost:" + 8080 + "/");

var trashCollector = function () {
    var curDate = new Date();
    var delArray = [];
    var filesCount = cacheFiles.files.length;
    if (filesCount.length == 0) return false;
    var outdate=cacheFiles.files.some(function (t,i)  {
        var fileTime = new Date(cacheFiles.files[i].time);
        var toDelete=((curDate - fileTime)) > cfg.timer;
        if (toDelete){
            delArray.push(i);
        }
        return toDelete;
    });
    if (!outdate) return false;
    delArray.every(function (v) {
        var fileName=cacheFiles.files[v].name;
        var filePath = cfg.fullSaveDir + fileName;
        fs.access(filePath, function (err) {
            if (!err) {
                fs.unlinkSync(filePath);
            }
        });
        cacheFiles.files.splice(v, 1);
    });
    updateCache();
};

setInterval(trashCollector, cfg.timer);

var getFileFromList = function (hash) {
    var searchFileIndex = cacheFiles.files.findIndex(function (elem) {
        return hash == elem.hash
    });
    if (searchFileIndex + 1) {
        cacheFiles.files[searchFileIndex].time = new Date();
        updateCache();
    }

    return cacheFiles.files[searchFileIndex];
};

var addFileToList = function (time, hash, name, fileName, documentId) {
    cacheFiles.files.push({"name": name, "time": time, "hash": hash, "filename": fileName, "documentId": documentId});
    updateCache();
};

var PdfCreator = function (cfg) {
    var pdfCreator = this;
    pdfCreator.init(cfg);
};

PdfCreator.prototype.init = function (cfg) {
    cfg = cfg || {};
    var pdfCreator = this;
    pdfCreator.cfg = cfg;
    pdfCreator.complete = cfg.complete || function () {
    };
    pdfCreator.saveDir = cfg.saveDir || "/documents/pdf/";
    pdfCreator.fullSaveDir = cfg.saveDir || __dirname + "/documents/pdf/";
    pdfCreator.type = cfg.type || 'pdf';
    return pdfCreator;
};

PdfCreator.prototype.create = function (cfg) {
    var wkhtmltopdfCfg = {};
    var pdfCreator = this;
    var cryptCfg = sha256(JSON.stringify(cfg));// hash Конфига
    var html = cfg.html || cfg.pdf_html || '';
    wkhtmltopdfCfg.marginLeft = cfg.marginLeft || cfg.leftSize || '12mm';
    wkhtmltopdfCfg.marginTop = cfg.marginTop || cfg.headerSize || '12mm';
    wkhtmltopdfCfg.marginRight = cfg.marginRight || cfg.rightSize || '8mm';
    wkhtmltopdfCfg.marginBottom = cfg.marginBottom || cfg.footerSize || '8mm';
    // wkhtmltopdfCfg.marginLeft -= 2.5;
    // wkhtmltopdfCfg.marginRight -= 2.5;
    wkhtmltopdfCfg.orientation = cfg.orientation || 'landscape';
    wkhtmltopdfCfg.encoding = cfg.encoding || 'utf-8';
    var defaultFontSize = cfg.defaultFontSize || '12px';
    var defaultFontFamily = cfg.fontFamily || 'Times New Roman';
    var boxSizing = "border-box";
    wkhtmltopdfCfg.pageSize = cfg.pdf_format || 'A4';
    // wkhtmltopdfCfg.noPdfCompression = true;
    // wkhtmltopdfCfg.disableSmartShrinking = true;
//after some time we can delete pdf

    // var customStyle = "<style>" +
    //     "th,td,tr{ page-break-inside:avoid !important; position:static !important; }" +
    //     "div{box-sizing: " + boxSizing + ";font-size: " + defaultFontSize + ";font-family: " + defaultFontFamily + "}" +
    //     "</style>";
    //
    //
    // html = customStyle + html;

    // var userStyleSheet = cfg.userStyleSheet;

    var curentDateTime = new Date();
    var mlsec = curentDateTime.getMilliseconds();
    var sec = curentDateTime.getHours();
    var min = curentDateTime.getMinutes();
    var hour = curentDateTime.getHours();
    mkdirp(pdfCreator.fullSaveDir, function (e) {
        if (e) console.log(e)
    });
    var fileName;
    if (cfg.filename) {
        fileName = path.basename(cfg.filename, '.pdf') + "(" + mlsec + '' + sec + '' + min + '' + hour + ').pdf';
    }
    else
        fileName = mlsec + '' + sec + '' + min + '' + hour + '.pdf';
    wkhtmltopdfCfg.output = filepath = cfg.path || pdfCreator.fullSaveDir + fileName;
    addFileToList(curentDateTime, cryptCfg, fileName);

    return new Promise(function (resolve, reject) {
        wkhtmltopdf(html, wkhtmltopdfCfg, function (e) {
            resolve({
                saveDir: pdfCreator.saveDir,
                fullSaveDir: pdfCreator.fullSaveDir,
                path: filepath,
                fileName: fileName,
                error: e
            });
        });
    });
};