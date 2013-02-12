#!/usr/bin/env node
/*
  Copyright (C) 2012 Juan Lasheras (http://www.juanl.org).

  This file is part of Quirky.

  Quirky is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  Quirky is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with Quirky.  If not, see <http://www.gnu.org/licenses/>.
*/

/**
 * @fileoverview Quirky node server
 * @author juan.lasheras@gmail.com (Juan Lasheras)
 */

(function () {
    "use strict";
}());

var http = require('http');
var url = require('url');
var querystring = require('querystring');
var fs = require('fs');

var cookies = require('./node_modules/cookies');

var static_files = {
    'index.html': fs.readFileSync('index.html'),
    'game-client.js': fs.readFileSync('game-client.js'),
    'layout.css': fs.readFileSync('layout.css'),
    'color.css': fs.readFileSync('color.css'),
    'typography.css': fs.readFileSync('typography.css'),
    'normalize.css': fs.readFileSync('thirdparty/normalize.css'),
    'jquery.min.js': fs.readFileSync('thirdparty/jquery.min.js'),
    'jquery-ui.min.js': fs.readFileSync('thirdparty/jquery-ui.min.js'),
    'jquery.cookie.js': fs.readFileSync('thirdparty/jquery.cookie.js'),
    'light_noise_diagonal.png': fs.readFileSync("media/light_noise_diagonal.png"),
    'wood.png': fs.readFileSync("media/dark_wood.png")
};

var CHATLINES = 1000;  // number of lines to store from chats

function Game(name) {
    this.name = name;
    this.board = [];  // list representation
    this.boardmat = [];  // matrix representation
    for (var i=0; i<181; i++) {
        this.boardmat[i] = new Array(181);
    }
    this.players = {};
    this.turn_pieces = [];  // pieces played this turn
    this.chat = [];  // chat log

    // board dimensions
    this.dimensions = {'top': 90, 'right': 90, 'bottom': 90, 'left': 90};

    /* Keep track of the pieces by having a list of piece objects each with a
     * count attribute that tracks how many of that piece are left. When this
     * reaches 0, we remove the piece object from the list.
     */
    this.pieces = [];
    var colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
    var shapes =  ['circle', 'star', 'diamond', 'square', 'triangle', 'clover'];
    for (var c in colors) {
        if (!colors.hasOwnProperty(c)) {
            continue;
        }
        for (var s in shapes) {
            if (!shapes.hasOwnProperty(s)) {
                continue;
            }
            this.pieces.push({'piece': new Piece(shapes[s], colors[c]), 'count': 3});
        }
    }
}

Game.prototype.toJSON = function() {
    return {'name': this.name, 'players': this.players};
};

/**
 * Draw some number of random pieces from the game stash.
 * @param num: {number} number of pieces to draw
 */
Game.prototype.drawPieces = function(num) {
    // draw num pieces from the pile
    var draw = [];
    while (draw.length < num && this.pieces.length > 0) {
        var r = Math.floor(Math.random() * this.pieces.length);
        var p = this.pieces[r].piece;
        draw.push(new Piece(p.shape, p.color));
        if ((this.pieces[r].count -= 1) < 1) {
            this.pieces.splice(r, 1);
        }
    }
    return draw;
};

/**
 * Return a list of pieces to the game.
 * @param pieces: {array} of Piece objects
 */
Game.prototype.returnPieces = function(pieces) {
    for (var p in pieces) {
        if (!pieces.hasOwnProperty(p)) {
            continue;
        }
        var piece = pieces[p];
        var found = this.pieces.some(function(x) {
            if (piece.equals(x.piece)) {
                x.count += 1;
                return true;
            }
        });
        if (!found) {  // first piece of its kind
            this.pieces.push({'piece': new Piece(piece.shape, piece.color),
                              'count': 1});
        }
    }
};

function Player (name) {
    this.name = name;
    this.pieces = [];
    this.points = 0;
    this.has_turn = false;
}

function Piece (shape, color) {
    this.shape = shape;
    this.color = color;
    this.equals = function(x) {
        return (this.shape === x.shape && this.color === x.color);
    };
}

function GamePiece (piece, row, column) {
    this.piece = piece;
    this.row = row;
    this.column = column;
    this.equals = function(x) {
        return (this.column === x.column && this.row === x.row &&
                this.piece.equals(x.piece));
    };
}

// typical response helper
function respOk (response, data, type) {
    if (type) {
        headers = {'Content-Type': type};
    }
    response.writeHead(200, headers);
    if (data) {
        response.write(data, 'utf-8');
    }
    response.end();
}

/**
 * Add a game piece to the board, check that:
 *  1. game piece doesn't already exist
 *  2. game piece is not adjacent to non-compatible piece
 * return: integer of points if Success, otherwise return an error string
 */
function addGamePiece(game, gamepiece) {

    var row = gamepiece.row;
    var col = gamepiece.column;
    var points = 0;

    if (game.boardmat[row][col] !== undefined) {
        return "GamePiece already exists.";
    }

    /**
     * Helper function, to check whether it is valid to place a piece
     * param piece: the piece object being placed
     * param getAdjacent: a function that returns an adjacent GamePiece
     * return: false if valid placement, otherwise return the offending GamePiece
     */
    function _adjacentPieces(piece, getAdjacent) {
        for (var i=1; i<=6; i++) {
            adjacent = getAdjacent(i);
            if (typeof adjacent === 'undefined') {
                return false;
            } else if (i === 6) { // can't have more than 6 pieces in a valid line
                return adjacent;
            }

            var samecolor = (adjacent.piece.color === piece.color);
            var sameshape = (adjacent.piece.shape === piece.shape);

            // console.log('piece: ' + piece.color + ' ' + piece.shape +
            //             ', adjacent: ' + adjacent.piece.color + ' ' +
            //             adjacent.piece.shape);

            // either samecolor or sameshape, not both
            if ((samecolor || sameshape) && !(samecolor && sameshape)) {
                // add a point for adjacent piece, if not been played this turn
                if (!game.turn_pieces.some(function(x) {
                    return x.equals(adjacent);})) {
                    points += 1;
                }
                continue;
            }
            return adjacent;
        }
        return false;
    }

    // check if adjacent pieces are compatible
    var checkLeft = _adjacentPieces(gamepiece.piece, function(offset) {
        var _row = row-offset;
        var piece = game.boardmat[_row][col];
        return piece && new GamePiece(piece, _row, col);
    });
    var checkRight =_adjacentPieces(gamepiece.piece, function(offset) {
        var _row = row+offset;
        var piece = game.boardmat[_row][col];
        return piece && new GamePiece(piece, _row, col);
    });
    var checkUp =_adjacentPieces(gamepiece.piece, function(offset) {
        var _col = col-offset;
        var piece = game.boardmat[row][_col];
        return piece && new GamePiece(piece, row, _col);
    });
    var checkDown =_adjacentPieces(gamepiece.piece, function(offset) {
        var _col = col+offset;
        var piece = game.boardmat[row][_col];
        return piece && new GamePiece(piece, row, _col);
    });
    var badPiece = (checkLeft || checkRight || checkUp || checkDown);

    if (badPiece !== false) {
        return ("GamePiece adjacent to incompatible piece: " +
                badPiece.piece.color + " " + badPiece.piece.shape);
    }

    // check if piece played in same row or column as past pieces this turn}
    function sameRowOrCol(otherpiece) {
        return (otherpiece.row === row || otherpiece.column === col);
    }
    if (game.turn_pieces) {
        if (!game.turn_pieces.every(sameRowOrCol)) {
            return ("GamePiece must be in same row or column as others " +
                    "placed this turn.");
        }
    }

    game.turn_pieces.push(gamepiece);
    game.boardmat[row][col] = gamepiece.piece;
    game.board.push(gamepiece);

    // update board dimensions
    var dim = game.dimensions;
    if (col < dim.left) {
        dim.left = col;
    } else if (col > dim.right) {
        dim.right = col;
    }
    if (row < dim.top) {
        dim.top = row;
    } else if (row > dim.bottom) {
        dim.bottom = row;
    }

    // debug logging, print out boardmat
    // for (var i=dim.top; i<=dim.bottom; i++) {
    //  for (var j=dim.left; j<=dim.right; j++) {
    //      var piecestr = (typeof game.boardmat[i][j] == "undefined") ? " ":
    //          game.boardmat[i][j];
    //      process.stdout.write('['+piecestr+']');
    //  }
    //  console.log('');
    // }

    return points+1;  // get one point for placing a piece
}

// find player from request cookie
function playerFromReq(request, response, game) {
    var jar = new cookies(request, response);
    var p = decodeURIComponent(jar.get('player'));
    return game.players[p];
}

// extract data from query string
function requestQuery(request) {
    return querystring.parse(url.parse(request.url).query);
}

// extract data from request body and pass to onEnd functon
function requestBody(request, onEnd) {
    var fullBody = '';
    request.on('data', function(d) {
        fullBody += d.toString();
    });
    request.on('end', function() {
        onEnd(querystring.parse(fullBody));
    });
}

/**
 * Pass the turn to the next player,
 * @param game: {obj} game object
 * @param player: {obj} player object
 */
function nextTurn(game, player) {
    if (player.has_turn === false) {  // we assume that player has the turn
        return;
    }
    player.has_turn = false;

    // give next player the turn
    var _players = Object.keys(game.players);
    var next_idx = (_players.indexOf(player.name) + 1) %
        _players.length;
    var next = game.players[_players[next_idx]];
    next.has_turn = true;
    // next player draws new pieces
    next.pieces = next.pieces.concat(game.drawPieces(
        6 - next.pieces.length));
}

/**
 * End the turn for the player and start for the next.
 * @param {obj} player: the player whose turn will end
 */
function switchPlayers(game, player) {
    // clear pieces played this turn
    game.turn_pieces = [];
    nextTurn(game, player);
}

/**
 * Create and add a player to a game.
 * @param game: {obj} game object
 * @param playernm: {str} player name
 */
function addPlayerToGame(game, playernm) {
    var p = new Player(playernm);
    p.pieces = game.drawPieces(6);
    game.players[p.name] = p;

    // if first player, make it his turn
    if (Object.keys(game.players).length === 1) {
        p.has_turn = true;
    }
}

/**
 * Handle a player resource transaction.
 * - POST to add player to the game.
 * - GET player pieces
 */
function handlePlayers(request, response, game, path) {
    var func, player, resp;
    if (!path.length) {
        // return info on the players collection

        if (request.method === "POST") {
            player = playerFromReq(request, response, game);
            if (player) {
                // end turn
                // TODO should this be under /players/<name>/?
                func = function (form) {
                    if (form && form.end_turn) {
                        switchPlayers(game, player);
                        respOk(response);
                    }
                };
            } else {
                // add player to a game
                func = function(form) {
                    if (form && form.name) {
                        addPlayerToGame(game, form.name);
                        var jar = new cookies(request, response);
                        jar.set("player", encodeURIComponent(form.name),
                                {httpOnly: false});
                        respOk(response, '', 'text/json');
                    }
                };
            }
            requestBody(request, func);
            return;
        } else if (request.method === 'DELETE') {
            // delete player from a game
            func = function(form) {
                if (form && form.name) {
                    player = game.players[form.name];
                    if (player === undefined) {
                        // huh? player is not in this game
                        response.writeHead(404, {'Content-Type': 'text/json'});
                        response.end();
                        return;
                    }
                    nextTurn(game, player);
                    game.returnPieces(player.pieces);
                    delete game.players[form.name];
                    if (Object.keys(game.players).length === 0) {
                        delete games[game.name];
                    }
                    respOk(response);
                }
            };
            requestBody(request, func);
            return;
        }  else {
            resp = JSON.stringify(game.players);
        }

    } else {
        // return info on a specific player
        player = game.players[path[0]];
        if (typeof player === 'undefined') {
            // player not found
            response.writeHead(404, {'Content-Type': 'text/json'});
            response.end();
            return;
        }

        if (path[1] === 'pieces') {
            resp = JSON.stringify(player.pieces);
        }
    }
    respOk(response, resp, 'text/json');
}

/**
 * Handle a game resource transaction.
 * - POST to add piece to the board.
 * - Forward player transactions to separate function.
 * - GET pieces on board & in bag
 * - GET dimensions
 */
function handleGame(request, response, game, path) {
    var resp;
    switch(path[0]) {
    case 'board':
        // add pieces to the board
        if (request.method === "POST") {
            requestBody(request, function(form) {

                var player = playerFromReq(request, response, game);
                // console.info('adding pieces, player:'+player.name);
                // console.info('form info:'+JSON.stringify(form));

                if (form && form.shape && form.color &&
                    form.row && form.column && player) {

                    // TODO should do form check?
                    var row = parseInt(form.row, 10);
                    var column = parseInt(form.column, 10);
                    var piece = new Piece(form.shape, form.color);

                    // check player has piece
                    var idx = -1, _idx = 0;
                    for (var p in player.pieces) {
                        var _piece = player.pieces[p];
                        //console.log('check:'+JSON.stringify(p)+', and:'+
                        //          JSON.stringify(piece));
                        if (piece.equals(_piece)) {
                            idx = _idx;
                            break;
                        }
                        _idx += 1;
                    }

                    if (idx > -1) {
                        var gp = new GamePiece(piece, row, column);
                        // console.info('adding piece:'+JSON.stringify(gp));
                        resp = addGamePiece(game, gp);
                        if (typeof resp === "string") {
                            // add gamepiece failed
                            response.writeHead(409, {'Content-Type': 'text/json'});
                            response.write(resp, 'utf-8');
                            response.end();
                            return;
                        } else {
                            // add gamepiece succeeded
                            player.points += resp;
                            player.pieces.splice(idx, 1);
                            respOk(response, '', 'text/json');
                        }
                    }
                }
            });
            return;
        }
        // get pieces on the board
        resp = JSON.stringify(game.board);
        break;
    case 'players':
        handlePlayers(request, response, game, path.slice(1));
        return;
    case 'pieces':
        // get pieces in the bag
        resp = JSON.stringify(game.pieces);
        break;
    case 'chat':
        handleChat(request, response, game.chat);
        break;
    case 'dimensions':
        resp = JSON.stringify(game.dimensions);
    }
    respOk(response, resp, 'text/json');
}

/**
 * Handle transaction on game collection resource.
 */
function handleGames(request, response, path) {
    var resp;
    if (!path.length) {
        if (request.method === "POST") {
            // add a new game object
            requestBody(request, function(form) {
                var gamenm = form.name;
                while (games[gamenm]) {
                    // game already exists, randomize a new one
                    gamenm = gamenm+Math.floor(Math.random()*10);
                }
                var game = new Game(gamenm);
                var jar = new cookies(request, response);
                var p = decodeURIComponent(jar.get('player'));
                games[gamenm] = game;
                addPlayerToGame(game, p);
                // respond with the game name, in case we randomized a new one
                respOk(response, JSON.stringify({name: gamenm}), 'text/json');
            });
        } else {
            // return info on the games collection
            resp = JSON.stringify(games);
            respOk(response, resp, 'text/json');
        }
    } else {
        // return info on a specifc game
        var game = games[path.shift()];
        if (game === undefined) {
            response.writeHead(404, {'Content-Type': 'text/json'});
            response.write("No such game exists", 'utf-8');
            response.end();
            return;
        }
        handleGame(request, response, game, path);
    }
}

/**
 * Handle transaction on chat.
 * @param chat {list}: a chat object, which is a list of
 *    {id: {number}, name: {string}, input: {string}} objects
 */
function handleChat(request, response, chat) {
    var resp, id;
    if (request.method === "POST") {
        // add a line to the chat log
        requestBody(request, function(form) {
            while (chat.length > CHATLINES) {
                chat.shift();
            }

            /* If data is present in the chat, then increment the last id,
             * otherwise start at 0.
             */
            if (chat.length) {
                id = chat[chat.length-1].id + 1;
            } else {
                id = 0;
            }
            chat.push({
                id: id,  // chat line id
                name: form.name,  // the user's name
                input: form.input  // the user's text input
            });
            respOk(response, '', 'text/json');
        });
    } else {
        /* Return chat data. If lastid is specified, then we only return
         * chat lines since this id.
         */
        var form = requestQuery(request);
        var lastid = +form.lastid;
        if (lastid >= 0) {
            for (var i=0; i<chat.length; i++) {
                if (chat[i].id === lastid) {
                    break;
                }
            }
            resp = JSON.stringify(chat.slice(i+1));
        } else {
            resp = JSON.stringify(chat);
        }
        respOk(response, resp, 'text/json');
    }
}

var chat = [];
var games = {};
var server = http.createServer();

server.on('request', function(request, response) {

    //console.log('games: '+JSON.stringify(games));
    //console.log('got url:'+request.url);

    var u = url.parse(request.url);
    var path = u.pathname.split('/').map(function(x) {
        return decodeURIComponent(x);
    }).filter(function(x) {
        return Boolean(x);
    });

    //console.log('decode: '+JSON.stringify(path));
    //console.log('req headers:'+JSON.stringify(request.headers));
    //console.log('got path:'+JSON.stringify(path));

    switch(path[0]) {
    case 'games':
        handleGames(request, response, path.slice(1));
        break;
    case 'chat':
        handleChat(request, response, chat);
        break;
    default:
        var f;
        // Assignment in if clase is purposeful
        if (f = static_files[path[0]]) {
            var type = 'text/html';
            if (path[0].search('css$') >= 0) {
                type = 'text/css';
            } else if (path[0].search('js$') >= 0) {
                type = 'text/javascript';
            }
            respOk(response, f, type);
        } else {
            respOk(response, static_files['index.html'], 'text/html');
        }
        break;
    }
});

var port = (process.env.PORT || process.env.npm_package_config_port || 8010);
server.listen(port);
