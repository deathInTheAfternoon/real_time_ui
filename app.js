
/**
 * Module dependencies.
 */

var express = require('express')
    , routes = require('./routes')
    , io = require('socket.io')
    , amqp = require('node-amqp')
    , nconf = require('nconf');

// Loading settings from file
nconf.file({file: 'appSettings.json'});

var app = module.exports = express.createServer();

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.session({ secret: 'your secret here' }));
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// Routes

app.get('/', routes.index);

// firing up the HTTP listeners.
app.listen(3000, function(){
    console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});

// intercepting traffic destined for /socket.io/
var sockio = io.listen(app);

// Initialising connection to RabbitMQ.
var rabbitmqConnection = amqp.createConnection({host: nconf.get('rabbitmq:host'), port: nconf.get('rabbitmq:port')});

rabbitmqConnection.on('ready', function(){
    rabbitmqConnection.queue(nconf.get('rabbitmq:queueName'), {autoDelete: false}, function(q){
        q.bind('#');

        sockio.sockets.on('connection', function(socket){
            socket.emit('news', {hello: 'world'});
            socket.on('browser message', function(data){
                console.log("Browser says: " + data);
            });
            q.subscribe(function(message){//todo: do we subscribe every time a client connects?
                console.log(message);
                // The following de-serialises JSON IFF publisher set message contentType to application/json.
                socket.emit('message', message)
            });
        });
    });
});