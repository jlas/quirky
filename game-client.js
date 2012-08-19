/*
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
 * @fileoverview Quirky client library
 * @author juan.lasheras@gmail.com (Juan Lasheras)
 */

var pastels = {
    "green": "#A0E7A0",
    "yellow": "#FFFB8C",
    "red": "#CD2626",
    "orange": "#FFAF5A",
    "purple": "#FF8CB6",
    "blue": "#97D0F9"
}

var ushapes = {
    "circle": "&#9679;",
    "star": "&#10022;",
    "diamond": "&#9670;",
    "square": "&#9632;",
    "triangle": "&#9650;",
    "clover": "&#9827;"
}

// right pointing finger
var finger = "&#9755;";

// Define DOM element IDs
var ADDGUEST = '#add_guest';
var ADDPIECE = '#add_piece';
var ADDPLAYER = '#add_player';
var BOARD = '#board';
var CHATIN = '#chat_input';
var ERRORS = '#errors';
var GAMEPIECES = '#game_pieces';
var GAMEROOM = '#game_room';
var GAMES = '#games';
var LOBBY = '#lobby';
var LOBBYLEFT = '#lobby_left';
var CHATPNL = '#chat_panel';
var PIECES = '#pieces';
var PLAYERS = '#players';
var PLAYERTBL = '#player_table';
var TURN = '#turn';

// Define DOM class names
var GRIDCLS = '.grid';
var PIECECLS = '.piece';
var SNAPGRIDCLS = '.snapgrid';

/**
 * Operates on player data returned from server.
 * @param {obj} pdata json data from the server
 */
function onGetPlayers(pdata) {
    var idx;
    var players = [];
    var my_player = $.cookie("player");

    $(PLAYERS).empty();
    $(PIECES).empty();
    $(TURN).empty();

    // display all players
    for (p in pdata) {
        var turn = pdata[p]['has_turn'] ? finger : "";
        $(PLAYERS).append(
            "<tr>"+
            "<td class='pturn'>"+turn+"</td>"+
            "<td class='pdata'>"+p+"</td>"+
            "<td class='pdata'>"+pdata[p]['points']+"</td>"+
            "</tr>");
    }

    // if no players to display, hide the player table
    if ($.isEmptyObject(pdata))
        $(PLAYERTBL).hide();

    // check if client has a valid player or allow him to add one
    my_player = pdata[my_player];
    if (typeof my_player === "undefined") {
        $(ADDPLAYER).show();
        $(ADDPLAYER+"> button")[0].onclick = function() {
            $.post("/games/test/players",
                   {name: $(ADDPLAYER+"> input")[0].value},
                   function() {getPlayers();}
                  );
        };
    } else {
        getMyPieces(my_player);
        $(ADDPIECE).show();
        $(ADDPLAYER).hide();
        // allow player to end his turn
        if (my_player["has_turn"]) {
            $(TURN).append("It's your turn! <button>End my turn</button>");
            $(TURN+"> button")[0].onclick = function() {
                $.post("/games/test/players", {end_turn: true},
                       function() {getPlayers();});
            };
        }
    }

    getGamePieces();
}

/**
 * Process player data.
 */
function getPlayers() {
    $.getJSON("/games/test/players", onGetPlayers);
}

/**
 * Add player's pieces to his sideboard and make active if it's his turn.
 * @param {obj} player
 */
function getMyPieces(player) {
    for (var i in player["pieces"]) {
        var piece = player["pieces"][i];
        $(PIECES).append('<div class="piece" style="color:'+
                         pastels[piece.color]+'">'+ushapes[piece.shape]+'</div>');
        $(PIECECLS+":last-child").data("piece", piece);
        $(PIECES).append("<div style='float: left; margin: 2px'>&nbsp</div>");
    }

    $(PIECECLS).width($(GRIDCLS).width());
    $(PIECECLS).height($(GRIDCLS).height());
    $(PIECECLS).css("font-size", $(GRIDCLS).css("font-size"));

    if (player['has_turn'])
        $(PIECECLS).draggable({
            containment: "#board",
            snap: ".snapgrid"
        });
}

/**
 * When piece is dropped, send a POST to the server to add to board. Either the
 * piece will be added or we get an error back for invalid placements.
 */
function onPieceDrop(event, ui) {
    var col = $(this).data()['col'];
    var row = $(this).data()['row'];
    var piece = $(ui.draggable).data()['piece'];
    $.ajax({
        type: 'POST',
        url: "/games/test/board",
        data: {
            shape: piece['shape'],
            color: piece['color'],
            row: row,
            column: col
        },
        success: function() {
            $(ERRORS).empty();
        },
        error: function (jqXHR, textStatus, errorThrown) {
            $(ERRORS).empty();
            $(ERRORS).append("<div class='error'>"+jqXHR.responseText+"</div>");
        },
        complete: function() {
            getBoard();
            getPlayers();
        }
    });
}

/**
 * Draw the game board.
 */
function getBoard() {
    var board_margin = 5;
    var rows = 0, cols = 0;
    var dimensions = {};

    $.getJSON("/games/test/dimensions", function (data) {
        var dimensions = data;
        // add 5 for each side since players can add up to 5 pieces per turn
        var top = dimensions["top"] - board_margin;
        var bottom = dimensions["bottom"] + board_margin;
        var left = dimensions["left"] - board_margin;
        var right = dimensions["right"] + board_margin;

        $(BOARD).empty();

        var rows = bottom - top + 1;
        var cols = right - left + 1;
        var k = 1;
        for (var i = 0; i < rows; i++) {
            for (var j = 0; j < cols; j++) {
                $(BOARD).append('<div class="grid"></div>');
                $(GRIDCLS+":last-child").data(
                    "col", (j+left)).data("row", (top+i));
            }
        }

        $(GRIDCLS).css("width", (100/cols)+"%");
        $(GRIDCLS).css("height", (100/rows)+"%");
        $(GRIDCLS).css("font-size", $(GRIDCLS).height());

        //$(BOARD).css("width", (($(GRIDCLS).width()) * 10))
        //$(BOARD).css("height", (($(GRIDCLS).height()) * 10))

        $.getJSON("/games/test/board", function (data) {
            // place pieces on board
            if (data.length > 0) {
                for (i in data) {
                    var piece = data[i].piece;
                    var row = data[i].row;
                    var col = data[i].column;
                    var drow = row - dimensions["top"] + board_margin;
                    var dcol = col - dimensions["left"] + board_margin;
                    var idx = drow*cols + dcol + 1;
                    $(GRIDCLS+":nth-child("+idx+")").addClass("boardpiece");
                    $(GRIDCLS+":nth-child("+idx+")").css("color",
                                                      pastels[piece.color]);
                    $(GRIDCLS+":nth-child("+idx+")").html(ushapes[piece.shape]);
                }
            } else {  // place marker in center if board is empty
                var idx = parseInt(($(GRIDCLS).length + 1) / 2);
                $(GRIDCLS+":nth-child("+idx+")").addClass('snapgrid');
            }

            // iterate through board and mark spots adjacent to pieces
            if (data.length > 0) {
                var offsets = [1, -1, cols, -cols];
                for (var i = 1; i <= $(GRIDCLS).length; i++) {
                    var cur = $(GRIDCLS+":nth-child("+i+")")
                    for (var j in offsets) {
                        var next = $(GRIDCLS+":nth-child("+(i+offsets[j])+")");
                        if (!cur.hasClass("boardpiece") &&
                            next.hasClass("boardpiece"))
                            cur.addClass("snapgrid");
                    }
                }
            }

            $(SNAPGRIDCLS).droppable({
                accept: PIECECLS,
                activate: function (event, ui) { $(SNAPGRIDCLS).html("&middot;"); },
                deactivate: function (event, ui) { $(SNAPGRIDCLS).html(""); },
                drop: onPieceDrop,
            });
        })
    })
}

/**
 * Publish the number of pieces left in the bag.
 */
function getGamePieces() {
    $.getJSON("/games/test/pieces", function(data) {
        $(GAMEPIECES).empty();
        var npieces = 0;
        for (var i in data)
            npieces += data[i].count;
        $(GAMEPIECES).html(npieces);
    });
}


/**
 * Draw the chat input.
 * @param {str} name: user's name
 * @param {obj} game: if specified, post the chat to the private game chat,
 *     otherwise post to the global chat.
 */
function getChatIn(name, game) {
    $(CHATIN).show();
    $(CHATIN+"> button")[0].onclick = function() {
        if (typeof game !== 'undefined')
            var resource = "/games/"+game+"/chat";
        else
            var resource = "/chat";
        $.post(resource, {input: $(CHATIN+"> input")[0].value,
                          name: name});
    }
}

/**
 * Draw the add guest widget.
 * - Set the player cookie when the user submits and switch to displaying the
 * chat input.
 */
function getAddGuest() {
    $(ADDGUEST).show();
    $(ADDGUEST+"> button")[0].onclick = function() {
        var name =  $(ADDGUEST+"> input")[0].value;
        $.cookie("player", name);
        $(ADDGUEST).hide();
        getChatIn(name);
    };
}

/**
 * Draw the lobby.
 */
function getLobby(games) {
    var my_player = $.cookie("player");
    $(LOBBYLEFT).append($(CHATPNL)[0]);
    $(CHATPNL).addClass('lobby_chat_panel');
    $(CHATPNL).show();
    if (!my_player)
        getAddGuest();
    else
        getChatIn(my_player);
    for (var i in games)
        $(GAMES).append("<tr>"+
                        "<td>"+games[i]['name']+"</td>"+
                        "<td>"+Object.keys(games[i]['players']).length+"</td>"+
                        "<td></td>"+
                        "</tr>");
}

/**
 * Display the lobby or a game room for the user.
 */
function gameOrLobby(games) {
    $(LOBBY).hide();
    $(GAMEROOM).hide();
    var my_game = $.cookie("game");
    // User is not in a valid game
    if (typeof games[my_game] === 'undefined') {
        $.removeCookie('game');
        $(LOBBY).show()
        getLobby(games);
    } else {
        $(GAMEROOM).show();
        getPlayers(my_game);
        getBoard(my_game);
        getGamePieces(my_game);
    }
}

/**
 * Main function.
 * - If the user has a game cookie, look up and put him in the game.
 * - Otherwise, put him in the lobby.
 */
$(function() {

    $.getJSON("/games", gameOrLobby);

    //setInterval("getPlayers()", 2000);

    /*
    $("#add_piece > button")[0].onclick = function() {
        var inputs = $("#add_piece > input");
        var selects = $("#add_piece > select");
        $.post("/game/board", {
            shape: selects[0].value,
            color: selects[1].value,
            row: inputs[0].value,
            column: inputs[1].value
        }, function() {
            getBoard();
            getGamePieces();
        });
    };
    */
});
