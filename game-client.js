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

/**
 * Operates on player data returned from server.
 * @param {obj} pdata json data from the server
 */
function onGetPlayers(pdata) {
    var idx;
    var players = [];
    var my_player = $.cookie("player");

    $("#players").empty();
    $("#pieces").empty();
    $("#turn").empty();

    // display all players
    for (p in pdata) {
        var turn = pdata[p]['has_turn'] ? finger : "";
        $("#players").append(
            "<tr>"+
            "<td class='pturn'>"+turn+"</td>"+
            "<td class='pdata'>"+p+"</td>"+
            "<td class='pdata'>"+pdata[p]['points']+"</td>"+
            "</tr>");
    }

    // if no players to display, hide the player table
    if ($.isEmptyObject(pdata))
        $("#player_table").hide();

    // check if client has a valid player or allow him to add one
    my_player = pdata[my_player];
    if (typeof my_player === "undefined") {
        $("#add_player").show();
    } else {
        getMyPieces(my_player);
        $("#add_piece").show();
        $("#add_player").hide();
        // allow player to end his turn
        if (my_player["has_turn"]) {
            $("#turn").append("It's your turn! <button>End my turn</button>");
            $("#turn > button")[0].onclick = function() {
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

function getMyPieces(player) {
    for (var i in player["pieces"]) {
        var piece = player["pieces"][i];
        $("#pieces").append('<div class="piece" style="color:'+
                            pastels[piece.color]+'">'+ushapes[piece.shape]+'</div>');
        $(".piece:last-child").data("piece", piece);
        $("#pieces").append("<div style='float: left; margin: 2px'>&nbsp</div>");
    }

    $(".piece").width($(".grid").width());
    $(".piece").height($(".grid").height());
    $(".piece").css("font-size", $(".grid").css("font-size"));

    if (player['has_turn'])
        $(".piece").draggable({
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
            $("#errors").empty();
        },
        error: function (jqXHR, textStatus, errorThrown) {
            $("#errors").empty();
            $("#errors").append("<div class='error'>"+jqXHR.responseText+"</div>");
        },
        complete: function() {
            getBoard();
            getPlayers();
        }
    });
}

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

        $("#board").empty();

        var rows = bottom - top + 1;
        var cols = right - left + 1;
        var k = 1;
        for (var i = 0; i < rows; i++) {
            for (var j = 0; j < cols; j++) {
                $("#board").append('<div class="grid"></div>');
                $(".grid:last-child").data(
                    "col", (j+left)).data("row", (top+i));
            }
        }

        $(".grid").css("width", (100/cols)+"%");
        $(".grid").css("height", (100/rows)+"%");
        $(".grid").css("font-size", $(".grid").height());

        //$("#board").css("width", (($(".grid").width()) * 10))
        //$("#board").css("height", (($(".grid").height()) * 10))

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
                    $(".grid:nth-child("+idx+")").addClass("boardpiece");
                    $(".grid:nth-child("+idx+")").css("color",
                                                      pastels[piece.color]);
                    $(".grid:nth-child("+idx+")").html(ushapes[piece.shape]);
                }
            } else {  // place marker in center if board is empty
                var idx = parseInt(($(".grid").length + 1) / 2);
                $(".grid:nth-child("+idx+")").addClass('snapgrid');
            }

            // iterate through board and mark spots adjacent to pieces
            if (data.length > 0) {
                var offsets = [1, -1, cols, -cols];
                for (var i = 1; i <= $(".grid").length; i++) {
                    var cur = $(".grid:nth-child("+i+")")
                    for (var j in offsets) {
                        var next = $(".grid:nth-child("+(i+offsets[j])+")");
                        if (!cur.hasClass("boardpiece") &&
                            next.hasClass("boardpiece"))
                            cur.addClass("snapgrid");
                    }
                }
            }

            $(".snapgrid").droppable({
                accept: ".piece",
                activate: function (event, ui) { $(".snapgrid").html("&middot;"); },
                deactivate: function (event, ui) { $(".snapgrid").html(""); },
                drop: onPieceDrop,
            });
        })
    })
}

function getGamePieces() {
    $.getJSON("/games/test/pieces", function(data) {
        $("#game_pieces").empty();
        var npieces = 0;
        for (var i in data)
            npieces += data[i].count;
        $("#game_pieces").html(npieces);
    });
}

$(function() {

    getPlayers();
    getBoard();
    getGamePieces();
    //setInterval("getPlayers()", 2000);

    $("#add_player > button")[0].onclick = function() {
        $.post("/games/test/players", {name: $("#add_player > input")[0].value},
               function() {getPlayers();});
    };

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
