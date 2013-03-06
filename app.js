// IMPORTS

var socket = require('socket.io');
var express = require('express'); //useful especially when working with multiple routes (jade files)
var app = express.createServer();
var io = socket.listen(app);
var redis = require('redis');
var redisClient = redis.createClient();
var usersClient = redis.createClient();
var room_code = null;

io.set('log level', 1); //reduces number of messages not logged explicitly

io.sockets.on('connection', function(client) {
	console.log("Client connected...");

	if(room_code == null)
		client.emit('authenticate', null);

	else
		client.emit("authenticate", false);

	client.on('authenticate', function(attempt){
		if(attempt == room_code)
			client.emit('authenticate', room_code);

		else
			client.emit('authenticate', false);
	});

	client.on("set-key", function(key){
		room_code = key;
		client.emit("authenticate", key);
	});

	client.on('messages', function(message) {
		client.get('nickname', function(err, name){
			storeMessage(name, message.data);

			//this is a LIST (we use a SET for users because they cann't contain duplicates)
			redisClient.lindex("messages", 0, function(err, message){
				message = JSON.parse(message); //parses message into usable object (so we can do things like 'message.name')
				client.emit("messages", message.name + ": " + message.data);
				client.broadcast.emit("messages", message.name + ": " + message.data);
			});
		});
	});

	client.on('join', function(name) {
		client.set('nickname', name);
		redisClient.lrange("messages", 0, 10, function(err, messages){
			messages = messages.reverse();
			messages.forEach(function(message){
				message = JSON.parse(message);
				client.emit("messages", message.name + ": " + message.data);
			});
		});

		usersClient.sadd("users", name);
		client.broadcast.emit("join", name);
		usersClient.smembers("users", function(err, users){
			users.forEach(function(user){
				client.emit("join", user);
			});
		});
	});

	client.on('disconnect', function(name) {
		console.log("Client disconnected...");
		client.get("nickname", function(err, name){
			client.broadcast.emit("disconnect", name);
			usersClient.srem("users", name);
		});
	});
});

var storeMessage = function(name, data){
	var message = JSON.stringify({name: name, data: data});
	console.log("message = " + message);
	redisClient.lpush("messages", message, function(err, response){
		redisClient.ltrim("messages", 0, 10);
	});//add message to end of array
}

app.configure(function(){
	app.use(express.static(__dirname + '/static')); //we have to do this because we're going to be using a "static" style.css
});

app.listen(8080);

console.log('Listening on port 8080...');