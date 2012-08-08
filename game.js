http = require('http');
url = require('url');
querystring = require('querystring');
fs = require('fs');

cookies = require('./node_modules/cookies');

var static_files = {
    'index': fs.readFileSync('index.html'),
    'game-client.js': fs.readFileSync('game-client.js'),
    'game-style.css': fs.readFileSync('game-style.css'),
    'jquery.min.js': fs.readFileSync('jquery/jquery.min.js'),
    'jquery-ui.min.js': fs.readFileSync('jquery/jquery-ui.min.js'),
    'jquery.cookie.js': fs.readFileSync('jquery/jquery.cookie.js')
}

function Game () {

    this.board = [];  // list representation
    this.boardmat = [];  // matrix representation
    for (var i=0; i<181; i++)
	this.boardmat[i] = new Array(181);
    this.pieces = [];
    this.players = {};

    // board dimensions
    this.dimensions = {'top': 90, 'right': 90, 'bottom': 90, 'left': 90};

    var colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
    var shapes =  ['circle', 'star', 'diamond', 'square', 'triangle', 'clover'];
    for (c in colors)
        for (s in shapes)
            this.pieces.push({'piece': new Piece(shapes[s], colors[c]), 'count': 3});
}

Game.prototype.drawPieces = function(num) {
    // draw num pieces from the pile
    var draw = [];
    while (draw.length < num && this.pieces.length > 0) {
        var r = Math.floor(Math.random() * this.pieces.length);
        var p = this.pieces[r]['piece'];
        draw.push(new Piece(p.shape, p.color));
        if ((this.pieces[r]['count'] -= 1) < 1)
            this.pieces.splice(r, 1)
    }
    return draw;
}

function Player (name) {
    
    this.name = name;
    this.pieces = [];
    this.has_turn = false;
}

function Piece (shape, color) {
    this.shape = shape;
    this.color = color;
    this.equals = function(x) {
        return (this.shape == x.shape && this.color == x.color);
    }
}

function GamePiece (piece, row, column) {
    this.piece = piece;
    this.row = row;
    this.column = column;
}

// typical response helper
function respOk (response, data, type) {
    if (type)
        headers = {'Content-Type': type};
    response.writeHead(200, headers);
    if (data)
        response.write(data, 'utf-8');
    response.end();
}

// add a game piece to the board, check that:
//  1. game piece doesn't already exist
//  2. game piece is not adjacent to non-compatible piece
// return nothing if Success, otherwise return an error json
function addGamePiece(gamepiece) {

    var row = gamepiece.row;
    var col = gamepiece.column;

    if (typeof game.boardmat[row][col] !== "undefined")
	return "GamePiece already exists.";
    
    // helper function, return true if adjacent piece is compatible
    function _adjacentPiece(piece, adjacent) {
	if (typeof adjacent === 'undefined')
	    return true;
	var samecolor = (adjacent.color == piece.color);
	var sameshape = (adjacent.shape == piece.shape);

	console.log('piece: ' + piece.color + ' ' + piece.shape +
		    ', adjacent: ' + adjacent.color + ' ' + adjacent.shape);

	// either samecolor or sameshape, not both
	if ((samecolor || sameshape) && !(samecolor && sameshape))
	    return true;
	return false
    }

    // check if adjacent pieces are compatible
    if (!(_adjacentPiece(gamepiece.piece, game.boardmat[row-1][col]) &&
	  _adjacentPiece(gamepiece.piece, game.boardmat[row+1][col]) &&
	  _adjacentPiece(gamepiece.piece, game.boardmat[row][col-1]) &&
	  _adjacentPiece(gamepiece.piece, game.boardmat[row][col+1])))
	return "GamePiece adjacent to incompatible piece.";

    game.boardmat[row][col] = gamepiece.piece;
    game.board.push(gamepiece);
    
    // update board dimensions
    var dim = game.dimensions;
    if (col < dim.left)
        dim.left = col;
    else if (col > dim.right)
        dim.right = col;
    if (row < dim.top)
        dim.top = row;
    else if (row > dim.bottom)
        dim.bottom = row;

    // debug logging, print out boardmat
    // for (var i=dim.top; i<=dim.bottom; i++) {
    // 	for (var j=dim.left; j<=dim.right; j++) {
    // 	    var piecestr = (typeof game.boardmat[i][j] == "undefined") ? " ": 
    // 		game.boardmat[i][j];
    // 	    process.stdout.write('['+piecestr+']');
    // 	}
    // 	console.log('');
    // }
}

// find player from request cookie
function playerFromReq(request, response) {
    var jar = new cookies(request, response);
    var p = jar.get('player');
    return game.players[p];
}

// extract data from request body and pass to onEnd functon
function requestBody(request, onEnd) {
    var fullBody = '';
    request.on('data', function(d) {fullBody += d.toString()});
    request.on('end', function() {
        onEnd(querystring.parse(fullBody))
    });
}

function handlePlayers(request, response, path) {
    
    if (!path.length) {
        // return info on the players collection

        if (request.method == "POST") {
            var player = playerFromReq(request, response);
            if (player)
                // end turn
                // TODO should this be under /players/<name>/?
                var func = function (form) {
                    if (form && form.end_turn) {
                        player.has_turn = false;

                        // give next player the turn
                        var _players = Object.keys(game.players);
                        var next_idx = (_players.indexOf(player['name']) + 1) %
                            _players.length;
                        var next = game.players[_players[next_idx]];
                        next.has_turn = true;

                        // draw new pieces
                        next.pieces = next.pieces.concat(game.drawPieces(
                            6 - next.pieces.length));
                        respOk(response);
                    }
                }
            else
                // add player
                var func = function(form) {
                    if (form && form.name) {
                        var p = new Player(form.name);
                        p.pieces = game.drawPieces(6);
                        game.players[p.name] = p;

                        // if first player, make it his turn
                        if (Object.keys(game.players).length == 1)
                            p.has_turn = true;

                        // TODO replace set cookie with cookie API?
                        response.writeHead(200, {'Content-Type': 'text/html',
                                    "Set-Cookie": ["player=" + form.name]});
                        response.end();
                    }
                }
            requestBody(request, func);
            return
        }
        else
            var r = JSON.stringify(game.players);

    } else {
        // return info on a specific player

        var player = game.players[path[0]];

        if (typeof player === 'undefined') {
            // player not found
            response.writeHead(404, {'Content-Type': 'text/html'});
            response.end();
            return;
        }

        switch(path[1]) {
        case 'pieces':
            var r = JSON.stringify(player.pieces);
        }
    }
    respOk(response, r, 'text/json');
}

function handleGame(request, response, path) {
    
    switch(path[0]) {
    case 'board':
        // add pieces to the board
        if (request.method == "POST") {
            requestBody(request, function(form) {

                var player = playerFromReq(request, response);
                console.info('adding pieces, player:'+player.name);
                console.info('form info:'+JSON.stringify(form));

                if (form && form.shape && form.color &&
                    form.row && form.column && player) {

                    // TODO should do form check?
                    var row = parseInt(form.row);
                    var column = parseInt(form.column);
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
                        console.info('adding piece:'+JSON.stringify(gp));
                        var resp = addGamePiece(gp);
			if (typeof resp !== "undefined") {
			    // add gamepiece failed
			    response.writeHead(409, {'Content-Type': 'text/json'});
			    response.write(resp, 'utf-8');
			    response.end();
			    return;
			} else {
			    // add gamepiece succeeded
                            player.pieces.splice(idx, 1);
			    respOk(response, '', 'text/json');
			}
                    }
                }
            });
	    return;
        }
        // get pieces on the board
        var r = JSON.stringify(game.board);
        break;
    case 'pieces':
        // get pieces in the bag
        var r = JSON.stringify(game.pieces);
        break;
    case 'dimensions':
        var r = JSON.stringify(game.dimensions);
    }
    respOk(response, r, 'text/json');
}

//var bob = new Player('bob');
//bob.pieces.push(new Piece('circle', 'red'));
//bob.pieces.push(new Piece('star', 'blue'));

var game = new Game();

server = http.createServer();

server.on('request', function(request, response) {

    //console.log('got request:'+JSON.stringify(request.headers));
    
    var u = url.parse(request.url);
    var path = u.pathname.split('/').filter(function(x) {return Boolean(x)});
    //console.log('req headers:'+JSON.stringify(request.headers));
    //console.log('got path:'+JSON.stringify(path));

    switch(path[0]) {
    case 'players':
        handlePlayers(request, response, path.slice(1));
        break;
    case 'game':
        handleGame(request, response, path.slice(1));
        break;
    default:
        var f;
        if (f = static_files[path[0]]) {
            var type = 'text/html';
            if (path[0].search('css$') >= 0)
                type = 'text/css';
            else if (path[0].search('js$') >= 0)
                type = 'text/javascript';
            respOk(response, f, type);
        }
        break;
    }
});

var port = process.env.PORT || 8010;
server.listen(port);
