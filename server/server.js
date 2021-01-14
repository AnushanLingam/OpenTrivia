const socketio = require("socket.io");
const express = require("express");
const http = require("http");
const path = require("path");

const { TriviaGameManager } = require("./utils/triviaGameManager");
const { isValidString } = require("./utils/validate");
const { getCategories, shuffleArray } = require("./utils/questions");


const port = process.env.PORT || 3000;
const app = express();
const publicPath = path.join(__dirname, "..", "public");
var server = http.createServer(app);
var io = socketio(server);
var games = new TriviaGameManager();

io.on("connection", (socket) => {
    console.log(`${socket.id} connected!`);

    getCategories().then((res) => {
        socket.emit("categories", res.trivia_categories);
    }).catch((err) => {
        console.log(err);
    });

    socket.on("msg", () => {
        console.log("Called")
        socket.emit("new", new Date().toTimeString());
    });

    socket.on("createRoom", (config, callback) => {
        if (isValidString(config.room)) {
            if (games.checkRoomName(config.room)) {
                games.addGame(socket.id, config.room, config.category, config.difficulty, config.questionCount);
                socket.join(config.room);
                
                callback({ code: "success"});
            } else {
                callback({
                    code: "ROOMERROR",
                    msg: `Room name ${config.room} is taken. Please try another name.`
                })

            }
        } else {
            callback({
                code: "ROOMERROR",
                msg: `Cannot use empty string for room name.`
            })
        }
    });

    socket.on("joinRoom", (config, callback) => {
        if (isValidString(config.name) && isValidString(config.room)) {
            var g = games.getGameByRoom(config.room);
            if (g && g.active) {
                return callback({
                    code: "NAMEERROR",
                    msg: `Cannot join room ${config.name}. Game has already started.`
                });
            };

            if (!games.checkRoomName(config.room)) {
                if (games.checkUsername(config.room, config.name)) {
                    games.addPlayer(config.room, config.name, socket.id);
                    socket.join(config.room);
                    socket.emit("joinedRoom");
                    var game = games.getGameByRoom(config.room);
                    var players = games.getFromRoom(config.room);
                    callback({code: "success"});
                    //io.to(game.host).emit("PLAYER-CONNECTED", { name: config.name, colour: config.colour, score: 0, stroke: "" });
                    io.to(config.room).emit("PLAYER-CONNECTED", { name: config.name, colour: config.colour, score: 0, stroke: "" });
                } else {
                    callback({
                        code: "NAMEERROR",
                        msg: `${config.name} is already being used in room: ${config.room}`
                    });
                }
            } else {
                callback({
                    code: "NAMEERROR",
                    msg: "Room does not exist!"
                });
            };
        } else {
            callback({
                code: "NAMEERROR",
                msg: `Please enter both the room name and username.`
            });
        }
    })

    socket.on("startGame", (undefined, callback) => {
        var roomName = games.getGameByHost(socket.id).room;
        if (roomName) {

            var players = games.getFromRoom(roomName);

            if (players.length > 0) {

                var question = setupQuestion(roomName);
                games.getGameByHost(socket.id).active = true;
                games.setWaiting(roomName);
                io.to(roomName).emit("newQuestion", {question, wait: false});
                callback({code: "success"});
            } else {
                callback({
                    code: "STARTERROR",
                    msg: "Not enough players to start the game."
                });
            }


        } else {
            // Add error handling!
        }
    });

    socket.on("submitAnswer", (ans, callback) => {
        var player = games.getPlayerBySocket(socket.id);
        if (player) {
            var question = games.getCurrentQuestion(player.room);
            console.log(decodeURIComponent(question.correct_answer), ans);
            if (decodeURIComponent(question.correct_answer) === ans) {
                var p = games.updateScore(socket.id, 1);
                callback({code: "correct", score: p.score});
                var g = games.getGameByRoom(p.room)
                io.to(g.host).emit("correctAnswer", {score: p.score, name: p.username});
            } else {
                callback({code: "incorrect", score: player.score, correct: decodeURIComponent(question.correct_answer)});
                var g = games.getGameByRoom(player.room)
                io.to(g.host).emit("incorrectAnswer", player.username);
            }

            games.updateWaiting(player.room);

            var waiting = games.getWaiting(player.room);

            if (waiting === 0) {
                var remaining = games.availableQuestions(player.room);
                if (remaining === 1) {
                    
                    var players = games.getFromRoom(player.room);
                    var response = [];
                    players.forEach((player) => {
                        var p = {
                            name: player.username,
                            score: player.score
                        };
                        response.push(p);
                    })
                    io.to(player.room).emit("msg");
                    io.to(player.room).emit("gameFinished", response);
                    console.log(`${player.room} finished!`);
                } else {
                    games.nextQuestion(player.room);
                    var res = setupQuestion(player.room);
                    games.setWaiting(player.room);
                    io.to(player.room).emit("newQuestion", {question: res, wait: true});
                }

            };


        };
    });


    socket.on("disconnect", () => {
        console.log(socket.id, "disconnected")
        var type = games.isHostOrPlayer(socket.id);

        if (type === "HOST") {
            var game = games.removeGame(socket.id);
            var players = games.removeFromRoom(game.room);
            players.forEach((player) => {
                io.emit("HOST-DISCONNECT");
            });
        } else if (type === "PLAYER") {
            var player = games.removePlayer(socket.id);
            var players = games.getFromRoom(player.room);
            var game = games.getGameByRoom(player.room);

            if (game.active) {
                if (players.length > 0) {
                    games.setWaiting(player.room);
                    io.to(player.room).emit("PLAYER-DISCONNECT", { name: player.username, score: player.score });
                } else {
                    var game = games.getGameByRoom(player.room);
                    games.removeGame(game.host);
                    var hostSocket = io.sockets.connected[game.host];
                    hostSocket.leave(game.room);
                    io.to(game.host).emit("ALL-DISCONNECT")
                    console.log(games.games, "    ", games.players);
                };
            } else {
                io.to(player.room).emit("PLAYER-DISCONNECT", { name: player.username, score: player.score });
            };

        };
    })
})




function setupQuestion(roomName) {
    var fullQuestion = games.getCurrentQuestion(roomName);
    var options = fullQuestion.incorrect_answers.concat(fullQuestion.correct_answer);
    var shuffledOptions = shuffleArray(options);
    var question = {
        category: decodeURIComponent(fullQuestion.category),
        type: fullQuestion.type,
        question: decodeURIComponent(fullQuestion.question),
        options: shuffledOptions
    };

    return question;
    ;
}


app.use(express.static(publicPath));

app.get("*", (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
});

server.listen(port, () => {
    console.log("Server Running!", port);
});
