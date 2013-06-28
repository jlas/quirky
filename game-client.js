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
 * @fileoverview Quirky client library
 * @author juan.lasheras@gmail.com (Juan Lasheras)
 */

(function () {
    "use strict";
}());

var pastels = {
    "green": "#A0E7A0",
    "yellow": "#FFFB8C",
    "red": "#CD2626",
    "orange": "#FFAF5A",
    "purple": "#FF8CB6",
    "blue": "#97D0F9"
};

var ushapes = {
    "circle": "&#9679;",
    "star": "&#10022;",
    "diamond": "&#9670;",
    "square": "&#9632;",
    "triangle": "&#9650;",
    "clover": "&#9827;"
};

// REs to limit input
NAMERE = /^.{1,12}$/;
CHATRE = /^.{1,500}$/;

// How long to let each turn last for, in seconds
var COUNTDOWNTIME = 60;  // 1 min

// Max players per room
var PLAYERLMT = 6;

// My Turn state
var HAVETURN = null;

// Define DOM element IDs
var ADDGAME = '#add_game';
var ADDGUEST = '#add_guest';
var ADDGUESTFRM = '#add_guest_form';
var ADDPIECE = '#add_piece';
var BOARD = '#board';
var CHATIN = '#chat_input';
var CHATLOG = '#chat_log';
var CHATPNL = '#chat_panel';
var COUNTDOWN = '#countdown';
var ENDTURN = '#end_turn';
var ERRORS = '#errors';
var FORKME = '#forkme';
var GAMEPIECES = '#game_pieces';
var GAMEROOM = '#game_room';
var GAMES = '#games_tbl';
var GAMESHR = '#lobby_game_panel>hr';
var HOWTO = "#howto";
var LEAVEGAME = '#leave_game';
var LOADINGGAME = '#loading_game';
var LOBBY = '#lobby';
var LOBBYCHAT = '#lobby_chat';
var NOGAMESMSG = '#no_games';
var PIECES = '#pieces';
var PLAYERS = '#players';
var SIDEBOARD = '#sideboard';
var TURN = '#turn';

// Define DOM class names
var GRIDCLS = '.grid';
var PIECECLS = '.piece';
var SNAPGRIDCLS = '.snapgrid';

// Define timeoutIDs for Ajax calls
var DRAWCHATTID = null;
var GETGAMESTID = null;
var GETPLAYERSTID = null;
var COUNTDOWNTID = null;

/**
 * Escape html. For displaying user input.
 * @param str: {string} string to escape
 */
function esc(str) {
    return $('<div/>').text(str).html();
}

var enc = encodeURIComponent;

/**
 * Countdown timer. Update onscreen timer and end turn if time gets too low.
 */
function countdownTimer() {
    $(COUNTDOWN).html("0m 0s");
    var end_t = COUNTDOWNTIME;
    var start_t = (new Date()).getTime()/1000;
    function countdown() {
        var cur_t = (new Date()).getTime()/1000;
        var timeleft = (end_t - (cur_t - start_t));
        if (timeleft >= 0) {
            var min = Math.floor(timeleft / 60);
            var sec = Math.floor(timeleft % 60);
            $(COUNTDOWN).html(min + "m " + sec + "s");
            COUNTDOWNTID = setTimeout(countdown, 1000);
        } else {
            $.post("/games/" + enc($.cookie("game")) + "/players",
                   {end_turn: true}, function() {
                getPlayers();
            });
        }
    }
    countdown();
}

/*
 * Operates on player data returned from the server.
 * @param {obj} pdata json data from the server
 */
function onGetPlayers(pdata) {
    $(PLAYERS).empty();
    // display all players
    for (var p in pdata) {
        if (!pdata.hasOwnProperty(p)) {
            continue;
        }
        var turn = pdata[p].has_turn ? "has_turn" : "";
        $(PLAYERS).append("<dt class='" + turn + "'>" + esc(p) + "</dt>" +
                          "<dd>" + pdata[p].points + "</dd>");
    }

    var my_game = $.cookie("game");
    var my_player = $.cookie("player");
    if (my_player) {
        if (pdata[my_player] === undefined) {
            // I've got a player name, but we need to add it to the game
            $.post("/games/" + enc(my_game) + "/players", {name: my_player},
                   function() {getPlayers();});
        } else if (HAVETURN !== pdata[my_player].has_turn) {
            HAVETURN = pdata[my_player].has_turn;
            if (HAVETURN) {
                countdownTimer();
            } else {
                clearTimeout(COUNTDOWNTID);
            }
            drawTurnInfo(pdata);
        }
    }
}

/**
 * Process player data.
 */
function getPlayers() {
    $.getJSON("/games/" + enc($.cookie("game")) +
              "/players", onGetPlayers);
}

/**
 * Draw player's pieces and It's Your Turn info.
 * @param {obj} pdata json data from the server
 */
function drawTurnInfo(pdata) {
    var my_game = $.cookie("game");
    var my_player = pdata[$.cookie("player")];

    $(PIECES).empty();
    $(ADDPIECE).show();

    // allow player to end his turn
    if (my_player.has_turn) {
        $(ENDTURN).removeAttr('disabled');
        $(TURN).html("It's your turn! You have " +
                     "<span id='countdown'>0m 0s</span> left.");
        $(ENDTURN)[0].onclick = function() {
            $.post("/games/" + enc(my_game) + "/players", {end_turn: true}, function() {
                getPlayers();

                /* Typically we let HAVETURN get updated from the server
                 * in onGetPlayers(), but if there is only one player this
                 * doesn't work very well (the player has to refresh manually).
                 * So we force it to false here in this special case.
                 */
                if (Object.keys(pdata).length === 1) {
                    HAVETURN = false;
                    clearTimeout(COUNTDOWNTID);
                }
            });
        };
    } else {
        $(ENDTURN).attr('disabled', '');
        $(TURN).html("It's not your turn.");
    }
    getPiecesLeft();
    getBoard();
    getMyPieces(my_player);
}

/**
 * Add player's pieces to his sideboard and make active if it's his turn.
 * @param {obj} player
 */
function getMyPieces(player) {
    for (var i in player.pieces) {
        var piece = player.pieces[i];
        $(PIECES).append('<div class="piece" style="color:'+
                         pastels[piece.color]+'">'+ushapes[piece.shape]+'</div>');
        $(PIECECLS+":last-child").data("piece", piece);
        $(PIECES).append("<div style='float: left; margin: 3px'></div>");
    }

    function setDimensions() {
        $(PIECECLS).width($(GRIDCLS).width());
        $(PIECECLS).height($(GRIDCLS).height());
        var fontsize = $(GRIDCLS).css("font-size");
        $(PIECECLS).css("font-size", fontsize);
        $(PIECECLS).css("line-height", fontsize);
    }
    /* Style switching is flaky here, we're depending on the width that was set
     * in getBoard() and maybe that happens too fast sometimes. So we add a
     * setTimeout to try setting dimensions again in a short while.
     */
    setDimensions();
    setTimeout(setDimensions, 250);

    if (player.has_turn)
        $(PIECECLS).draggable({
            containment: "#board",
            snap: ".snapgrid"
        });
}

/**
 * Publish the number of pieces left in the bag.
 */
function getPiecesLeft() {
    $.getJSON("/games/" + enc($.cookie("game")) +
              "/pieces", function(data) {
        $(GAMEPIECES).empty();
        var npieces = 0;
        for (var i in data)
            npieces += data[i].count;
        $(GAMEPIECES).html(npieces);
    });
}

/**
 * When piece is dropped, send a POST to the server to add to board. Either the
 * piece will be added or we get an error back for invalid placements.
 */
function onPieceDrop(event, ui) {
    var col = $(this).data().col;
    var row = $(this).data().row;
    var piece = $(ui.draggable).data().piece;
    $.ajax({
        type: 'POST',
        url: "/games/" + enc($.cookie("game")) + "/board",
        data: {
            shape: piece.shape,
            color: piece.color,
            row: row,
            column: col
        },
        success: function() {
            $(ERRORS).empty();
        },
        error: function (jqXHR, textStatus, errorThrown) {
            $(ERRORS).empty();
            $(ERRORS).append("<div class='error'>&#9888; "+jqXHR.responseText+"</div>");
        },
        complete: function() {
            $.getJSON("/games/" + enc($.cookie("game")) +
                      "/players", drawTurnInfo);
        }
    });
}

/**
 * Draw the game board.
 */
function getBoard() {
    var game = $.cookie("game");
    var board_margin = 5;

    $.getJSON("/games/" + enc(game) + "/dimensions", function (data) {
        var dimensions = data;
        // add 5 for each side since players can add up to 5 pieces per turn
        var top = dimensions.top - board_margin;
        var bottom = dimensions.bottom + board_margin;
        var left = dimensions.left - board_margin;
        var right = dimensions.right + board_margin;

        $(BOARD).empty();

        var rows = bottom - top + 1;
        var cols = right - left + 1;
        for (var i = 0; i < rows; i++) {
            for (var j = 0; j < cols; j++) {
                $(BOARD).append('<div class="grid"></div>');
                $(GRIDCLS+":last-child").data(
                    "col", (j+left)).data("row", (top+i));
            }
        }

        // if ($(BOARD).width() < $(BOARD).height()) {
        //     $(BOARD).height($(BOARD).width());
        // } else {
        //     $(BOARD).width($(BOARD).height());
        // }

        $(GRIDCLS).css("width", (100/cols)+"%");
        $(GRIDCLS).css("height", (100/rows)+"%");
        var fontsize = Math.min($(GRIDCLS).height(), $(GRIDCLS).width());
        $(GRIDCLS).css("font-size", fontsize);

        //$(BOARD).css("width", (($(GRIDCLS).width()) * 10))
        //$(BOARD).css("height", (($(GRIDCLS).height()) * 10))

        $.getJSON("/games/" + enc(game) + "/board", function (data) {
            var i, idx;
            // place pieces on board
            if (data.length > 0) {
                for (i in data) {
                    var piece = data[i].piece;
                    var row = data[i].row;
                    var col = data[i].column;
                    var drow = row - dimensions.top + board_margin;
                    var dcol = col - dimensions.left + board_margin;
                    idx = drow*cols + dcol + 1;
                    $(GRIDCLS+":nth-child("+idx+")").addClass("boardpiece");
                    $(GRIDCLS+":nth-child("+idx+")").css("color",
                                                      pastels[piece.color]);
                    $(GRIDCLS+":nth-child("+idx+")").html(ushapes[piece.shape]);
                }
                $(".boardpiece").css("line-height", fontsize+"px");
            } else {  // place marker in center if board is empty
                idx = parseInt(($(GRIDCLS).length + 1) / 2, 10);
                $(GRIDCLS+":nth-child("+idx+")").addClass('snapgrid');
            }

            // iterate through board and mark spots adjacent to pieces
            if (data.length > 0) {
                var offsets = [1, -1, cols, -cols];
                for (i = 1; i <= $(GRIDCLS).length; i++) {
                    var cur = $(GRIDCLS+":nth-child("+i+")");
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
                activate: function (event, ui) {
                    $(SNAPGRIDCLS).html("&middot;");
                    $(BOARD).addClass("activate");
                },
                deactivate: function (event, ui) {
                    $(SNAPGRIDCLS).html("");
                    $(BOARD).removeClass("activate");
                },
                drop: onPieceDrop
            });
        });
    });
}

/**
 * Draw the game play instructions.
 */
function drawHowTo() {
    $(LOBBY).hide();
    $(HOWTO).show();
}

/**
 * Draw the chat input.
 */
function drawChatIn() {
    $(CHATIN).show();
    function submit() {
        var chatin = $(CHATIN+"> input")[0].value;
        if (!CHATRE.test(chatin)) {
            if(chatin) {
                alert("Your input text is too long!");
            }
            return false;
        }
        var game = $.cookie("game");
        var resource;
        if (game) {
            resource = "/games/" + enc(game) + "/chat";
        } else {
            resource = "/chat";
        }
        $.post(resource, {
            input: chatin,
            name: $.cookie("player")
        }, function() {
            $(CHATIN+"> input").val('');  // post was succesful, so clear input
            drawChatLog();
        });
    }
    $(CHATIN+"> button").click(submit);
    $(CHATIN+"> input:visible").focus();
    $(CHATIN+"> input").keydown(function(event) {
        if (event.keyCode === 13) {
            submit();
        }
    });
}

/**
 * Draw the add guest widget.
 * - Set the player cookie when the user submits and switch to displaying the
 * chat input.
 */
function drawAddGuest() {
    $(ADDGUEST).show();

    function submit() {
        var name =  $(ADDGUESTFRM+"> input")[0].value;
        if (!NAMERE.test(name)) {
            if(name) {
                alert("Your input text is too long!");
            }
            return false;
        }
        $.cookie("player", name);
        main();
    }
    $(ADDGUESTFRM+"> button").click(submit);
    $(ADDGUESTFRM+"> input:visible").focus();
    $(ADDGUESTFRM+"> input").keydown(function(event) {
        if (event.keyCode === 13) {
            submit();
        }
    });
}

/**
 * Draw the chat log.
 * Implemented as a closure to keep state about what the last line on the chat
 * received from the server was.
 */
var drawChatLog = function() {
    var lastids = {};
    return function () {
        var my_player = $.cookie("player");
        var my_game = $.cookie("game");
        var uri = my_game ? '/games/' + enc(my_game) + '/chat' : '/chat';
        $.getJSON(uri, {lastid: lastids[uri]}, function(data) {
            if ($.isEmptyObject(data)) {
                // Server returns empty obj if there's nothing new
                return;
            }
            for (var i=0; i<data.length; i++) {
                var name = data[i].name;
                var msgcls = (name === my_player) ? "mymsg": "othermsg";
                $(CHATLOG).prepend('<div><span class="' + msgcls + '">' +
                                   esc(data[i].name) + '</span>: ' +
                                   esc(data[i].input) + '</div>');
            }
            lastids[uri] = data[i-1] ? data[i-1].id : undefined;
        });
    };
}();

/**
 * Draw the game list.
 */
function drawGameList(games) {
    $(GAMES).empty();
    var thead = "<th>Game Room</th><th>Players</th><th></th>";
    for (var i in games) {
        if (!games.hasOwnProperty(i)) {
            continue;
        }
        var name = games[i].name;
        var numplayers = Object.keys(games[i].players).length;
        var full = "";
        var node = $("<td>" + esc(name) + "</td>")[0];
        if (numplayers < PLAYERLMT) {
            // only allow joining rooms if player limit is not met
            node = $("<td><a href='#game_room'>" + esc(name) + "</a></td>")[0];
            node.onclick = function (name) {
                // nested function to capture name in a closure
                return function() {
                    $.cookie('game', name);
                    clearTimeout(GETGAMESTID);
                    location.reload();
                };
            }(name);
        } else {
            full = " (full)";
        }
        $(GAMES).append(
            "<tr><td>" + numplayers + full + "</td><td></td></tr>");
        $(GAMES+">tbody>tr:last-child").prepend(node);
    }

    if (!$(GAMES+">*").length) {
        $(NOGAMESMSG).show();
        $(GAMESHR).hide();
    } else {
        $(NOGAMESMSG).hide();
        $(GAMESHR).show();
        $(GAMES).prepend(thead);
    }

    function submit() {
        var gamenm = $(ADDGAME+"> input")[0].value;
        if (!NAMERE.test(gamenm)) {
            if(gamenm) {
                alert("Your input text is too long!");
            }
            return false;
        }
        $.post('/games', {name: gamenm},

               /**
                * @param data: {obj} contains potential random game name,
                *     e.g. {name: <game name>}
                */
               function(data) {
                   // post was succesful, so clear input
                   $(ADDGAME+"> input").val('');
                   $(LOBBY).hide();
                   $(LOADINGGAME).show();

                   var tries = 0;
                   function loadgame() {
                       $.getJSON("/games", function(games) {
                           for (var i in games) {
                               if (!games.hasOwnProperty(i)) {
                                   continue;
                               }
                               if (data.name === games[i].name) {
                                   // game is ready
                                   $.cookie('game', data.name);
                                   location.reload();
                                   return;
                               }
                           }
                           if (++tries > 3) {
                               return;
                           }
                       });
                       setTimeout(loadgame, 1000);
                   }
                   setTimeout(loadgame, 1000);
               });
    }

    // TODO: figure out why jquery click and keydown functions screw this up?
    $(ADDGAME+"> button")[0].onclick = submit;
    $(ADDGAME+"> input")[0].onkeydown = function(event) {
        if (event.keyCode === 13) {
            submit();
        }
    };
}

/**
 * Draw the lobby.
 */
function drawLobby(games) {
    $(LOBBYCHAT).append($(CHATPNL)[0]);
    $(CHATPNL).addClass('lobby_chat_panel');
    drawGameList(games);

    // setup future calls to get game list
    function pollGames() {
        $.getJSON("/games", drawGameList);
        GETGAMESTID = setTimeout(pollGames, 2000);
    }
    GETGAMESTID = setTimeout(pollGames, 2000);
}

/**
 * Draw the game.
 */
function drawGame() {
    getPlayers();
    getBoard();
    getPiecesLeft();
    $(SIDEBOARD).append("<hr/>");
    $(SIDEBOARD).append($(CHATPNL));
    $(CHATPNL).addClass('game_chat_panel');
    $(LEAVEGAME)[0].onclick = function () {
        clearTimeout(GETPLAYERSTID);
        $.ajax({
            type: 'DELETE',
            url: "/games/" + enc($.cookie("game")) + "/players",
            data: {name: $.cookie("player")},
            success: function() {
                $.removeCookie('game');
                location.reload();
            }
        });
    };

    // setup future calls
    function pollPlayers() {
        getPlayers();
        GETPLAYERSTID = setTimeout(pollPlayers, 2000);
    }
    GETPLAYERSTID = setTimeout(pollPlayers, 2000);
}

/**
 * Display the lobby, a game room, or the add guest for the user.
 */
function gameOrLobby(games) {
    $(LOBBY).hide();
    $(GAMEROOM).hide();
    $(ADDGUEST).hide();

    if (!$.cookie("player")) {
        drawAddGuest();
        return;
    }

    // hide the fork me banner from now on
    $(FORKME).hide();

    var my_game = $.cookie("game");
    // User is not in a valid game
    if (typeof games[my_game] === 'undefined') {
        $.removeCookie('game');
        $(LOBBY).show();
        drawLobby(games);
    } else {
        $(GAMEROOM).show();
        drawGame();
    }
    $(CHATPNL).show();
    drawChatLog();
    drawChatIn();

    // setup future calls to get chat
    function pollChat() {
        drawChatLog();
        DRAWCHATTID = setTimeout(pollChat, 2000);
    }
    DRAWCHATTID = setTimeout(pollChat, 2000);
}

/**
 * Main function.
 * - If the user has a game cookie, look up and put him in the game.
 * - Otherwise, put him in the lobby.
 */
function main() {
    $.getJSON("/games", gameOrLobby);
}

$(function() {
    main();
});
