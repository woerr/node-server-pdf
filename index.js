var app = require('express')(),
  // bodyParser = require('body-parser'),
  // upload = multer({ dest: 'uploads/' }),
  mkdirp = require('mkdirp'),
  http = require('http').Server(app),
  server,
  // fs = require('fs'),
  wkhtmltopdf = require('wkhtmltopdf');
  // JSZip = require('jszip');

const path = require('path');

/**
 * Парсер formData (не сделан парсинг файлов, скорее всего будет падать из-за нехватки оперы)
 * @param req
 * @param res
 * @param next
 */
var formDataParse = function(req, res, next){
  try{
    var boundaryRe = /\s*(?:Content-Type:)*\s*multipart\/form-data;\s*boundary\s*=\s*(.*)/i;
    var boundaryRaw = ''+req.headers['content-type'];
    var boundary = boundaryRaw.match(boundaryRe);
    boundary = boundary[1] || boundary;

    var rawBody = '';
    req.setEncoding('utf8');

    var parse = function(rawBody){

      var reBody = new RegExp('--'+boundary+'-{0,2}');
      var reName = /[\s\r\n]*name="([a-z0-9_-]*)"[\s\r\n]+(.*)[\s\r\n]+/i;
      var _bodyes = (''+rawBody).split(reBody);
      req.formData = {};
      for(var item in _bodyes){
        var _body = (''+_bodyes[item]).match(reName);
        if(_body && _body[1]) req.formData[_body[1]]=_body[2];
      }
      next();
    };

    req.on('data', function(chunk) {
      rawBody += chunk;
    });

    req.on('end', function() {
      parse(rawBody);
    });
  }catch(e){next();}
};
app.use(formDataParse);

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

var queryCreatePdf = function(req, res, next) {
  var cfg;
  if(req.params.cfg) cfg = JSON.parse(req.params.cfg);

  var pdfCreator = new PdfCreator();
  var formData = req.formData || {};
  pdfCreator.create({html:formData.html||''})
  // pdfCreator.create({html:'<div>Test html <span>по русски</span></div>'})
    .then(function(pdf){
      // pdf.path = pdf.path.replace('./','');
      res.redirect(301, req.protocol + '://' + req.get('host')+'/getPdf/'+path.basename(pdf.path));
      // res.sendFile(pdf.path, {root: __dirname});
    })
    .catch(function(e){
      res.send({e:e});
    });
};
var queryGetPdf = function(req, res, next) {
  var fileName = req.params.filename;
  var dir = '/documents/pdf/documentation/';
  var path = dir+fileName;
  res.sendFile(path, {root: __dirname});
};

app.post('/createPdf/:cfg?', queryCreatePdf);
app.get('/createPdf/:cfg?', queryCreatePdf);
app.get('/getPdf/:filename?', queryGetPdf);

server = http.listen(8080); // Запуск сервера.
console.log("Сервер запущен http://localhost:"+8080+"/");


var PdfCreator = function(cfg){
  var pdfCreator = this;
  pdfCreator.init(cfg);
};

PdfCreator.prototype.init = function(cfg){
  cfg = cfg || {};
  var pdfCreator = this;
  pdfCreator.cfg = cfg;
  pdfCreator.complete = cfg.complete || function () {};
  pdfCreator.saveDir  = cfg.saveDir || "/documents";
  pdfCreator.type = cfg.type || 'pdf';
  return pdfCreator;
};

PdfCreator.prototype.create = function(cfg){
  var pdfCreator = this;
  var html = cfg.html||'';
  var marginLeft = cfg.marginLeft || '12mm';
  var marginTop = cfg.marginTop || '12mm';
  var marginRight = cfg.marginRight || '0mm';
  var orientation = cfg.orientation || 'landscape';
  var encoding = cfg.encoding || 'utf-8';

  var userStyleSheet = cfg.userStyleSheet;

  var curentDateTime = new Date();
  var mlsec = curentDateTime.getMilliseconds();
  var sec = curentDateTime.getHours();
  var min = curentDateTime.getMinutes();
  var hour = curentDateTime.getHours();
  var dir = cfg.dir || '.'+pdfCreator.saveDir+'/pdf/documentation/';
  mkdirp(dir,function(e){if(e)console.log(e)});
  var path = cfg.path || dir+mlsec+''+sec+''+min+''+hour+'.pdf';

  return new Promise(function(resolve, reject){
    wkhtmltopdf(html, {
      userStyleSheet: userStyleSheet,
      output: path,
      encoding: encoding,
      orientation: orientation,
      marginLeft: marginLeft,
      marginTop: marginTop,
      marginRight: marginRight
    }, function (e){
      resolve({path:path,error:e});
    });
  });
};