//todo: how do we know we are gracefully shutting down RabbitMQ connections etc.?
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
    // Parameters for Exch and Q must match server's.
    rabbitmqConnection.exchange(nconf.get('rabbitmq:simulationExchange'), {type: 'fanout', durable: false}, function(exchange){
     rabbitmqConnection.queue('', {exclusive: false}, function(q) {
            q.bind(nconf.get('rabbitmq:simulationExchange'), '');

            sockio.sockets.on('connection', function(socket){
                socket.emit('news', {hello: 'world'});
                socket.on('browser message', function(data){
                    console.log("Browser says: " + data);
                });
                q.subscribe(function(message){//todo: do we subscribe every time a web client connects?
                    //todo: add start/stop/progress messages.
                    //todo: add visuals for start stop progress using HTML5.
                    console.log("simulationExchange sent " + message.description);
                    // The following de-serialises JSON IFF publisher set message contentType to application/json.
                    socket.emit('messageSim', message)
                });
            });
        });

    });

    rabbitmqConnection.exchange(nconf.get('rabbitmq:businessExchange'), {type: 'direct', durable: false}, function(exchange){
        rabbitmqConnection.queue(nconf.get('rabbitmq:businessEventQ'), {durable: false, exclusive: false, autoDelete: false}, function(q) {
            q.bind(nconf.get('rabbitmq:businessExchange'), nconf.get('rabbitmq:businessEventQ'));

            sockio.sockets.on('connection', function(socket){
                socket.emit('news', {message: 'Awaiting Business Events'});
                socket.on('browser message', function(data){
                    console.log("Browser says: " + data);
                });
                // Source shows prefetch Defaults to 1, but I want to make it EXPLICIT for pedagogical purposes.
                q.subscribe({prefetchCount: 1}, function(message){//todo: do we subscribe every time a web client connects?
                    //todo: add start/stop/progress messages.
                    //todo: add visuals for start stop progress using HTML5.
                    console.log("businessExchange sent " + message.id);
                    // The following de-serialises JSON IFF publisher set message contentType to application/json.
                    socket.emit('messageBusi', message)
                });
            });
        });

    });

});
