var path = require('path');
var Hapi = require('hapi');
var Boom = require('boom');
var Good = require('good');
var mkdirp = require('mkdirp');
var jwt = require('jsonwebtoken');
var GoodFile = require('good-file');
var GoodConsole = require('good-console');
var hapiAuthJwt = require('hapi-auth-jwt');
var methods = require(path.normalize(__dirname + '/methods'));
var config = require(path.normalize(__dirname + '/../config'));
var serverOptions = require(path.normalize(__dirname + '/server-options'));
var server = new Hapi.Server();
var connection = server.connection(serverOptions);

var defaultRegisterCb = function(err) { if (err) throw(err); };

// logging only regiestered if config enabled
var options = {};
if (config.logEnabled) {
  var opsPath = path.normalize(__dirname +  '/../logs/server/operations');
  var errsPath = path.normalize(__dirname + '/../logs/server/errors');
  var reqsPath = path.normalize(__dirname + '/../logs/server/requests');
  mkdirp.sync(opsPath);
  mkdirp.sync(errsPath);
  mkdirp.sync(reqsPath);
  var configWithPath = function(path) {
    return { path: path, extension: 'log', rotate: 'daily', format: 'YYYY-MM-DD-X', prefix:'epochtalk' };
  };
  var consoleReporter = new GoodConsole({ log: '*', response: '*' });
  var opsReporter = new GoodFile(configWithPath(opsPath), { log: '*', ops: '*' });
  var errsReporter = new GoodFile(configWithPath(errsPath), { log: '*', error: '*' });
  var reqsReporter = new GoodFile(configWithPath(reqsPath), { log: '*', response: '*' });
  options.reporters = [ consoleReporter, opsReporter, errsReporter, reqsReporter ];
  server.register({ register: Good, options: options}, defaultRegisterCb);
}

// auth via jwt
server.register(hapiAuthJwt, function(err) {
  if (err) throw err;
  var strategyOptions = {
    key: config.privateKey,
    validateFunc: require(path.normalize(__dirname + '/jwt-validate'))
  };
  server.auth.strategy('jwt', 'jwt', strategyOptions);
});

// server routes
var routes = require(path.normalize(__dirname + '/routes'));
server.route(routes.endpoints());

// server methods
server.method(methods);

// lout for api documentation
server.register({ register: require('lout') }, defaultRegisterCb);

server.start(function () {
  server.log('debug', 'config: ' + JSON.stringify(config, undefined, 2));
  server.log('info', 'Epochtalk Frontend server started @' + server.info.uri);
});
