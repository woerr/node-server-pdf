const fs = require('fs');

const httpsOptions = {
	cert: fs.readFileSync('./fullchain.pem'),
	key: fs.readFileSync('./privkey.pem')
};

const app = require('express')(),
    bodyParser = require('body-parser'),
    mkdirp = require('mkdirp'),
    http = require('http').Server(app),
    https = require('https')	
    unzip = require('unzip'),
    request = require('request'),
    wkhtmltopdf = require('wkhtmltopdf'),
    sha256 = require('sha256'),
    archiver = require('archiver');
pdftk = require('node-pdftk');
const unzipResponse = require('unzip-response');
// multer = require('multer'); // v1.0.5
// upload = multer(); // for parsing multipart/form-data;
formidable = require('formidable');
// JSZip = require('jszip');
let cacheFiles = {};

const enviroment = {
    weldbookUrl: 'weldbook.ru',
    WBFUrl: 'tobolsk.weldbook.ru/WBF'
};
if (process.argv.findIndex(x => x == '-WBUrl') + 1)
    enviroment.weldbookUrl = process.argv[process.argv.findIndex(x => x == '-WBUrl') + 1];
console.log(enviroment);
const updateCache = function () {
    fs.writeFile('cache_files.json', JSON.stringify(cacheFiles), function (err) {
        if (!err) ;
    });
};

const getFilesCache = function () {
    fs.readFile('cache_files.json', function (err, rawdata) {
        if (!err)
            cacheFiles = JSON.parse(rawdata);
    });
};
getFilesCache();


const path = require('path');

const WBDriveData = {
    login: 'Node_Pdf_Generator',
    pwd: 'f6b7895fcb63a3d9bbf7301520014fe0',
    folderId: 15,
    url: 'http://tobolsk.weldbook.ru/WBF/'
};

const cfg = {
    timer: 60 * 1000 * 60,
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
app.use(bodyParser.json({limit: '50mb'})); // for parsing application/json

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

const queryCreatePdf = function (req, res, next) {
    var cfg;
    var file;
    if (req.params.cfg) cfg = JSON.parse(req.params.cfg);
    var pdfCreator = new PdfCreator();
    var createPdf = function (reqData) {
        var creatorCfg = reqData;
        var cryptCfg = sha256(JSON.stringify(creatorCfg));// hash Конфига
        if (false){
            // console.log('Cache is working - '+file.name);
//             res.redirect(req.protocol + '://' + req.get('host') + '/getPdf/' + path.basename(file.name) + ((cfg && cfg.userFilename) ? ('/' + cfg.userFilename) : ''));
        }
        else pdfCreator.create(creatorCfg)
        // pdfCreator.create({html:'<div>Test html <span>по русски</span></div>'})
            .then(function (pdf) {
                // pdf.path = pdf.path.replace('./','');
                // res.send(pdf);
                res.redirect(req.protocol + '://' + req.get('host') + '/getPdf/' + path.basename(pdf.path) + ((cfg && cfg.userFilename) ? ('/' + cfg.userFilename) : ''));
                // res.sendFile(pdf.path, {root: __dirname});
            })
            .catch(function (e) {
                res.send({e: e});
            });
    };
    if (req._body) {
        console.log(new Date() + 'got url encode');
        createPdf(req.body);
    }
    else {
        console.log(new Date() + 'got formdata');
        var form = new formidable.IncomingForm();
        var formData;
        form.parse(req, function (err, fields, files) {
            formData = fields;
            createPdf(formData);
        });
    }
};

const sendFile = function (fileName, response, userFilename) {
    const filePath = __dirname + fileName;
    var filename = '';
	console.log('sendfile: ' + fileName + ' / ' + userFilename);
    if (userFilename)
        filename = userFilename;
    else
        filename = path.basename(fileName);
    // Check if file specified by the filePath exists
    fs.exists(filePath, function (exists) {
        if (exists) {
            // Content-type is very interesting part that guarantee that
            // Web browser will handle response in an appropriate manner.
	     response.statusCode = 200;
      		response.setHeader('location', server.address() + filePath);
      		response.setHeader('Content-Disposition', "inline; filename=\"" + encodeURI(filename) + "\"");
      		response.flushHeaders();
           // /*response.writeHead(200, {
             //   "Content-Disposition": "inline; filename=\"" + filename + "\"",
            //    "Location": server.address() + filePath
            //});*/
            fs.createReadStream(filePath).pipe(response);
        } else {
            response.writeHead(400, {"Content-Type": "text/plain"});
            response.end("ERROR File" + filePath + " does not exist");
        }
    });
};

const queryGetPdf = function (req, res, next) {
    var fileName = req.params.filename || '';
    var userFileName = req.params.customName;
    var dir = cfg.saveDir;
    var path = dir + fileName;
    sendFile(path, res, userFileName);
};

const parseRequest = function (req) {
    if (!req._body) {
        console.log(new Date() + 'got url encode');
        const form = new formidable.IncomingForm();
        let formData;
        return form.parse(req, function (err, fields, files) {
            console.log('parsed', fields);
            formData = fields;
            return (formData);
        });
    }
    else {
        console.log(new Date() + 'got formdata');
        return (req.body);
    }
};

function implodePdfInDir(dirName, fileName, req, res) {
    var implodeResult;
    fs.readdir(dirName, function (err, files) {
        if (err)
            return false;
        console.log(files);
        var resultFilename = 'pdftkOut' + new Date().getTime() + '.pdf';
        pdftk
            .input(files.map(function (v) {
                    return dirName + '/' + v;
                })
            )
            .cat()
            .output(fileName || 'documents/pdf/' + resultFilename)
            .then(function (buffer) {
                rimraf(dirName);

                var cfgData = JSON.parse(req.params.cfg);
                console.log('got sendToWBF Data', cfgData);
                if (cfgData.sendToWBF) {
                    console.log('got sendToWBF Data', cfgData.sendToWBF);
                    var formData = {};
                    for (var key in cfgData.sendToWBF)
                        formData[key] = cfgData.sendToWBF[key]
                    formData['userfile'] = {
                        value: buffer,
                        options: {
                            filename: 'test1.pdf',
                            contentType: 'application/pdf'
                        }

                    };
                    delete formData['application'];
                    request.post('http:/' + enviroment.weldbookUrl + '/php/main.php?save=DestructiveTestingConclusionFilesToWBF', {formData: formData}, function (err, resp, body) {
                        if (err) {
                            console.log('Error!');
                            res.send('Error!');
                        } else {
                            res.send(body);
                        }
                    });

                    // request({
                    //     uri: 'http://php-weldbook.ru/php/main.php?save=DestructiveTestingConclusionFilesToWBF',
                    //     json:true,
                    //     body:cfgData.sendToWBF,
                    //     method: 'POST',
                    //     responseType: 'text'
                    // },  function (error, response, body) {
                    //     if (error) {
                    //         return console.error('upload failed:', error);
                    //     }
                    //     console.log('Upload successful!  Server responded with:', body);
                    // })
                    // ).then(function (resp) {
                    //         res.write(resp.data);
                    //         res.end();
                    //     }).catch(function (err) {
                    //         console.log('request send error', err)
                    //     });

                }
                else
                    res.redirect(req.protocol + '://' + req.get('host') + '/getPdf/' + path.basename(resultFilename));
            }).catch(function (err) {
            console.log('implode fail', err);
            res.send('implode fail');
        })

    });
}

function rimraf(dir_path) {
    console.log('delete ' + dir_path);
    if (fs.existsSync(dir_path)) {
        fs.readdirSync(dir_path).forEach(function (entry) {
            const entry_path = path.join(dir_path, entry);
            if (fs.lstatSync(entry_path).isDirectory()) {
                rimraf(entry_path);
            } else {
                fs.unlinkSync(entry_path);
            }
        });
        fs.rmdirSync(dir_path);
    }
}

const queryTestCreatePdf = function (req, res, next) {
    var cfg;
    var file;
    console.log(new Date() + ' got request');
    var paramsTranslator = {
        'sheet-size': 'pageSize',
        'margin-left': 'marginLeft',
        'margin-right': 'marginRight',
        'margin-top': 'marginTop',
        'margin-bottom': 'marginBottom'
    };
    if (req.params.cfg) cfg = JSON.parse(req.params.cfg);
    var translateSettings = function (arr) {
        var settings = [];
        var keys = Object.keys(arr);
        var values = Object.values(arr);
        keys.forEach(function (k, i) {
            if (k == 'sheet-size' || k == 'pdf_format' || k == 'pageSize') {
                if (paramsTranslator[keys[i]])
                    settings[paramsTranslator[keys[i]]] = values[i].match(/(\w+)/gi)[0];
                else
                    settings[keys[i]] = values[i].match(/(\w+)/gi)[0];

                if (values[i].match(/(\w+)/gi).length > 1)
                    if (values[i].match(/(\w+)/gi)[1] == 'L')
                        settings['orientation'] = 'Landscape';
                    else settings['orientation'] = 'Portrait';
            }
            else {
                if (paramsTranslator[keys[i]])
                    settings[paramsTranslator[keys[i]]] = values[i];
                else
                    settings[keys[i]] = values[i];
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
        var html = creatorCfg.html || creatorCfg['pdf_html'];
        // var customStyle = "<style>tr,td,th{page-break-inside: avoid;} table{page-break-inside: auto;box-sizing: " + boxSizing + ";font-size: " + defaultFontSize + ";font-family: " + defaultFontFamily + "}</style>";
        // var customStyle ='<link rel="stylesheet" href="http://weldbook.ru/css/wkhtml_style_block.css">';
        //  var customStyle ='';
        console.log(creatorCfg);
        if (!html) {
            res.send({status: false, msg: 'no html'});
            res.end();
            return;
        }

        var pages = html.split(/<pagebreak[^<]*<\/pagebreak>/g);
        var pageBreakers = html.match(/(<pagebreak[^<]*<\/pagebreak>)/g);
        // pages = pages.map(function (v) {
        //     return customStyle + v;
        // });
        // var customStyle = "<style>" +
        //     "th,td,tr{ page-break-inside:avoid !important; position:static !important; }" +
        //     "div{box-sizing: " + boxSizing + ";font-size: " + defaultFontSize + ";font-family: " + defaultFontFamily + "}" +
        //     "</style>";
        //
        if (pageBreakers)
            var pageSettings = pageBreakers.map(function (t, number) {
                var pb = t.match(/((\S+)=[",'](\S+)[',"])/gi);
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
        else pageSettings = [];
        var testdir = 'testpdf/';
        var docdir = path.basename(creatorCfg.filename, '.pdf') + new Date().getTime();
        var createdFolder = testdir + docdir;
        globalSettings = translateSettings(globalSettings);
        fs.access(createdFolder, function (err) {
            if (!err) {
                console.log('exist');
                fs.rmdir(createdFolder, function (e) {
                    console.log('existFolder removed. err', e);
                    fs.mkdir(createdFolder, function () {
                        createBuffersArray(pages.length - 1);
                    });
                });
            } else {
                fs.mkdir(createdFolder, function () {
                    console.log(createdFolder + ' not exist');
                    createBuffersArray(pages.length - 1);
                });
            }
        });

        function createBuffersArray(i) {
            if (i < -300) return false;
            if (i < 0) {
                console.log('pages rendered');
                setTimeout(function () {
                    var ret = false;
                    console.log('try -', 0 - i);
                    ret = implodePdfInDir(createdFolder, null, req, res);

                }, 1000);

            }
            else {
                console.log('render page - ', i);
                if (pageSettings[i - 1]) {
                    var settings = pageSettings[i - 1];
                    settings.marginLeft = settings.marginLeft + 'px';
                    settings.marginTop = settings.marginTop + 'px';
                    settings.marginRight = settings.marginRight + 'px';
                    settings.marginBottom = settings.marginBottom + 'px'
                }

                else
                    var settings = {};
                var outPath = createdFolder + '/' + i + '.pdf';
                wkhtmltopdf(pages[i].toString(), {
                    output: outPath,
                    encoding: settings.encoding || globalSettings.encoding,
                    noPdfCompression: true,
                    pageSize: (!settings.pageSize || settings.pageSize.indexOf('undefined') + 1) ? globalSettings.pageSize : settings.pageSize,
                    orientation: (!settings.orientation || settings.orientation.indexOf('undefined') + 1) ? globalSettings.orientation : settings.orientation,
                    marginLeft: (!settings.marginLeft || settings.marginLeft.indexOf('undefined') + 1) ? globalSettings.marginLeft : settings.marginLeft,
                    marginTop: (!settings.marginTop || settings.marginTop.indexOf('undefined') + 1) ? globalSettings.marginTop : settings.marginTop,
                    marginRight: (!settings.marginRight || settings.marginRight.indexOf('undefined') + 1) ? globalSettings.marginRight : settings.marginRight,
                    marginBottom: (!settings.marginBottom || settings.marginBottom.indexOf('undefined') + 1) ? globalSettings.marginBottom : settings.marginBottom,
                    disableSmartShrinking: true
                }, function (e, stream) {
                    console.log('wkhtml debug');
                    if (e)
                        console.log('wkhtml error', e);
                    createBuffersArray(i - 1);
                })


            }

        }
    };
    if (!req._body) {
        console.log(new Date() + 'got url encode');
        var form = new formidable.IncomingForm();
        var formData;
        form.parse(req, function (err, fields, files) {
            formData = fields;
            createPdf(formData);
        });
    }
    else {
        console.log(new Date() + 'got formdata');
        createPdf(req.body);
    }
    // createPdf(parseRequest(req));
};

const checkCachesPdf = function (req, res, next) {
    const target = 'http://' + enviroment.WBFUrl + '/op/op.SeparatedPdfStorage.php?command=isFileExist';
    let form = {};
    form.login = WBDriveData.login;
    form.pwd = WBDriveData.pwd;
    form.fileHash = req.query['fileHash'];
    request.post(target, {formData: form}, (err, response, body) => {
        res.send(body);
        // console.log('body',body);
    });

};

const addPdfToSeparatedCache = function (filePath, hash) {
    let gotFiles;

    // console.log(fields,files);
    const tmpDir = 'cachesPdfs/' + new Date().getTime();
    fs.mkdirSync(tmpDir);
    fs.mkdirSync(tmpDir + '/pages');
    const archive = archiver('zip', {
        zlib: {level: 9} // Sets the compression level.
    });
    const output = fs.createWriteStream(tmpDir + '/example.zip');
    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', function (err) {
        if (err.code === 'ENOENT') {
            // log warning
        } else {
            // throw error
            throw err;
        }
    });
// good practice to catch this error explicitly
    archive.on('error', function (err) {
        throw err;
    });
// pipe archive data to the file
    archive.pipe(output);
    pdftk
        .input(filePath)
        .burst(tmpDir + '/pages' + '/page_%02d.pdf')
        .then(function (buffer) {
                archive.directory(tmpDir + '/pages', false);
                const test = archive.finalize();
                const target = 'http://' + enviroment.WBFUrl + '/op/op.SeparatedPdfStorage.php?command=saveSeparatedPages';
                test.then((archVar) => {
                    fs.readFile(tmpDir + '/example.zip', (err, file) => {
                        let ws = request.post(target, function (error, response, body) {
                            console.log('server encoded the data as: ' + (response.headers['content-encoding'] || 'identity'));
                            console.log('the decoded data is: ' + body);
                            rimraf(tmpDir);
                        });
                        let form = ws.form();
                        form.append('login', WBDriveData.login);
                        form.append('pwd', WBDriveData.pwd);
                        form.append('archiveHash', hash);
                        form.append('pdfArchive', file, {filename: 'archive.zip'});
                    });

                });
            }
        ).catch(function (error) {
        console.log({status: false, msg: error});
    });

};

const queryPdfPages = function (req, res, next) {
    let gotFiles;
    if (!req._body) {
        console.log(new Date() + 'got request');
        let form = new formidable.IncomingForm();
        let formData;
        form.parse(req, function (err, fields, files) {
            // console.log(fields,files);
            formData = fields;
            if (!formData.catParams) {
                res.send({status: false, msg: 'requestFail'});
                return;
            }
            gotFiles = files;
            if (+formData.fileCached) {
                const target = 'http://' + enviroment.WBFUrl + '/op/op.SeparatedPdfStorage.php?command=getFilePages';
                let ws = request.post(target);
                const entryes = [];
                ws.pipe(unzip.Parse())
                    .on('entry', (entry) => {
                        const fileName = entry.path;
                        const type = entry.type; // 'Directory' or 'File'
                        const size = entry.size;
                        const bufs = [];
                        entry.on('data', function (d) {
                            bufs.push(d);
                        });
                        entry.on('end', function () {
                            const buf = Buffer.concat(bufs);
                            entryes.push(buf);
                        });
                        if (fileName === "this IS the file I'm looking for") {
                            entry.pipe(fs.createWriteStream('output/path'));
                        } else {
                            entry.autodrain();
                        }
                    }).on('close', () => {
                    // console.log(entryes);
                    pdftk
                        .input(entryes)
                        .cat()
                        .output()
                        .then(function (buffer) {
                            pdftk
                                .input(buffer)
                                .cat(formData.catParams)
                                .output('./donePdftkCat.pdf')
                                .then(function (buffer) {
                                        let cfgData = fields;
                                        // console.log('got sendToWBF Data', cfgData);
                                        if (cfgData.sendToWBF) {
                                            // console.log('got sendToWBF Data', cfgData.sendToWBF);
                                            let formData = cfgData;
                                            formData['userfile'] = {
                                                value: buffer,
                                                options: {
                                                    filename: 'test1.pdf',
                                                    contentType: 'application/pdf'
                                                }
                                            };
                                            for (let key in formData) {
                                                if (formData[key] === null) delete formData[key]
                                            }
                                            request.post('http://' + enviroment.weldbookUrl + '/php/main.php?save=DestructiveTestingConclusionFilesToWBF', {formData: formData}, function (err, resp, body) {
                                                if (err) {
                                                    console.log('Error!');
                                                    res.send('Error!');
                                                } else {
                                                    res.send(body);
                                                }
                                            });
                                        }
                                        else
                                        {
                                            // res.download('./donePdftkCat.pdf', 'test.pdf');
                                            res.setHeader('Content-disposition', 'attachment; filename=' + 'test.pdf');
                                            res.setHeader('Content-type', 'application/pdf');
                                            res.send(buffer);
                                        }
                                    }
                                ).catch(function (error) {
                                res.send({status: false, msg: error});
                            });
                            }
                        ).catch(function (error) {
                        res.send({status: false, msg: error});
                    });
                });
                let form = ws.form();
                form.append('login', WBDriveData.login);
                form.append('pwd', WBDriveData.pwd);
                form.append('fileHash', formData['fileHash']);
                form.append('pages', formData['catParams']);
            }
            else {
                console.log('FILE IS NO CACHED');
                addPdfToSeparatedCache(gotFiles['userfile'].path, formData['fileHash']);
                pdftk
                    .input(gotFiles['userfile'].path)
                    .cat(formData.catParams)
                    .output('./donePdftkCat.pdf')
                    .then(function (buffer) {
                            let cfgData = fields;
                            // console.log('got sendToWBF Data', cfgData);
                            if (cfgData.sendToWBF) {
                                // console.log('got sendToWBF Data', cfgData.sendToWBF);
                                let formData = cfgData;
                                formData['userfile'] = {
                                    value: buffer,
                                    options: {
                                        filename: 'test1.pdf',
                                        contentType: 'application/pdf'
                                    }
                                };
                                for (let key in formData) {
                                    if (formData[key] === null) delete formData[key]
                                }
                                request.post('http://' + enviroment.weldbookUrl + '/php/main.php?save=DestructiveTestingConclusionFilesToWBF', {formData: formData}, function (err, resp, body) {
                                    if (err) {
                                        console.log('Error!');
                                        res.send('Error!');
                                    } else {
                                        res.send(body);
                                    }
                                });
                            }
                            else
                                res.download('./donePdftkCat.pdf', gotFiles['userfile'].name);
                        }
                    ).catch(function (error) {
                    res.send({status: false, msg: error});
                });
            }


        });
    }
    else {
        console.log(new Date() + 'got formdata');
    }
};
app.post('/createPdf/:cfg?', queryCreatePdf);
app.post('/testCreatePdf/:cfg?', queryTestCreatePdf);
app.get('/testCreatePdf/:cfg?', queryTestCreatePdf);
app.post('/getPdfPages/:cfg?', queryPdfPages);
app.post('/addPdfToSeparatedCache/:cfg?', addPdfToSeparatedCache);
app.get('/getPdfPages/:cfg?', queryPdfPages);
app.get('/checkCachesPdf/:cfg?', checkCachesPdf);
app.post('/checkCachesPdf/:cfg?', checkCachesPdf);
app.get('/addPdfToSeparatedCache/:cfg?', addPdfToSeparatedCache);
app.get('/createPdf/:cfg?', queryCreatePdf);
app.get('/getPdf/:filename?/:customName?', queryGetPdf);

server = http.listen(8080); // Запуск сервера.
https.createServer(httpsOptions,app).listen(8443);

console.log("Сервер запущен http://localhost:" + 8080 + "/");

const trashCollector = function () {
    var curDate = new Date();
    var delArray = [];
    var filesCount = cacheFiles.files.length;
    if (filesCount.length == 0) return false;
    var outdate = cacheFiles.files.some(function (t, i) {
        var fileTime = new Date(cacheFiles.files[i].time);
        var toDelete = ((curDate - fileTime)) > cfg.timer;
        if (toDelete) {
            delArray.push(i);
        }
        return toDelete;
    });
    if (!outdate) return false;
    delArray.every(function (v) {
        var fileName = cacheFiles.files[v].name;
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

const getFileFromList = function (hash) {
    var searchFileIndex = cacheFiles.files.findIndex(function (elem) {
        return hash == elem.hash
    });
    if (searchFileIndex + 1) {
        cacheFiles.files[searchFileIndex].time = new Date();
        updateCache();
    }

    return cacheFiles.files[searchFileIndex];
};

const addFileToList = function (time, hash, name, fileName, documentId) {
    cacheFiles.files.push({"name": name, "time": time, "hash": hash, "filename": fileName, "documentId": documentId});
    updateCache();
};

const PdfCreator = function (cfg) {
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
