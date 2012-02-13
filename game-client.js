
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

function getPlayers() {
    var player = $.cookie("player");
    
    $.getJSON("/players", function (data) {
        var idx;
        var players = [];
        for (p in data)
            players.push(p);
        $("#players").html(players.join(", "));
        if (typeof data[player] === "undefined") {
            $("#add_player").show();
            $("#pieces").html("");
        } else {
            getMyPieces(player);
            $("#add_piece").show();
            $("#add_player").hide();
        }
    });
}

function getMyPieces(player) {
    //$("#pieces").load("/players/"+player+"/pieces");
    $.getJSON("/players/"+player+"/pieces", function (data) {
        for (var i in data) {
            var piece = data[i];
            $("#pieces").append('<div class="piece" style="color:'+
                pastels[piece.color]+'">'+ushapes[piece.shape]+'</div>');
            $("#pieces").append("<div style='float: left; margin: 2px'>&nbsp</div>");
        }
        
        $(".piece").draggable({
            containment: "#board",
            snap: ".snapgrid"
        });

        $(".piece").width($(".grid").width());
        $(".piece").height($(".grid").height());
    });
}

function getBoard() {
    var board_margin = 5;
    var rows = 0, cols = 0;
    var dimensions = {};

    $.getJSON("/game/dimensions", function (data) {
        var dimensions = data;
        // add 5 for each side since players can add up to 5 pieces per turn
        var rows = dimensions["bottom"] - dimensions["top"] + 1 + (2*board_margin);
        var cols = dimensions["right"] - dimensions["left"] + 1 + (2*board_margin);
        for (var i = 0; i < rows; i++)
            for (var j = 0; j < cols; j++)
                $("#board").append('<div class="grid"></div>');

        $(".grid").css("width", (100/cols)+"%");
        $(".grid").css("height", (100/rows)+"%");
        
        //$("#board").css("width", (($(".grid").width()) * 10))
        //$("#board").css("height", (($(".grid").height()) * 10))
    
        $.getJSON("/game/board", function (data) {
            // place pieces on board
            if (data.length > 0) {
                for (i in data) {
                    var piece = data[i].piece;
                    var row = data[i].row;
                    var col = data[i].column;
                    var drow = row - dimensions["top"] + board_margin;
                    var dcol = col - dimensions["left"] + board_margin;
                    var idx = drow*cols + dcol;
                    $(".grid:nth-child("+idx+")").addClass("boardpiece");
                    $(".grid:nth-child("+idx+")").css("color", pastels[piece.color]);
                    $(".grid:nth-child("+idx+")").html(ushapes[piece.shape]);
                }
            } else {  // place marker in center if board is empty
                var idx = parseInt($(".grid").length / 2);
                $(".grid:nth-child("+idx+")").html('&middot;');
                $(".grid:nth-child("+idx+")").addClass('snapgrid');
            }

            // place markers around exisiting pieces, iterate through all the
            // board spots and check the adjacent spots
            if (data.length > 0) {
                var offsets = [1, -1, cols, -cols];
                for (var i = 1; i <= $(".grid").length; i++) {
                    var cur = $(".grid:nth-child("+i+")")
                    for (var j in offsets) {
                        var next = $(".grid:nth-child("+(i+offsets[j])+")");
                        if (!cur.hasClass("boardpiece") &&
                            next.hasClass("boardpiece"))
                            cur.html("&middot;").addClass("snapgrid");
                    }
                }
            }
        })
    })
}

function getGamePieces() {
    $.getJSON("/game/pieces", function(data) {
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
        $.post("/players", {name: $("#add_player > input")[0].value},
               function() {getPlayers();});
    };

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
});
