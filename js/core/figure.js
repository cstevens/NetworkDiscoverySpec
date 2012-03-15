// XXX untested
define(
    [],
    function () {
        return {
            run:    function (conf, doc, cb) {
                progress("handling figures");

                doc.normalize();
                var figMap = {};
                var tof = [];
                // Find figures and assign titles
                $(".figure", doc).each(function (i, figure) {
                    var title = $(figure).attr("title") ||
                        $(figure).find("[title]").attr("title") ||
                        $(figure).attr("alt") ||
                        $(figure).find("[alt]").attr("alt");
                    if (!title) error("Figure must have a self or child with a @title or @alt");
                    var id = $(figure).makeID("fig", title)
                    figMap[id] = $("<span class='figno'>" + (i + 1) + "</span>" +
                                   "<span class='fig-title'>" + title + "</span>");
                    var capt = $("<p class='caption'><span class='figno'>" +
                                                        (i + 1) + "</span>" + title +
                                "</p>");
                    tof[i] = $("<li class='tofline'><a class='tocxref' href='#" + id + "'><span class='figno'>" + (i + 1) + "</span>" + title + "</a></li>");
                    if ($(figure).is("div")) {
                        // If figure is a div, presume it encloses an image of some form.
                        // append the caption to the figure
                        $(figure).append(capt);
                    } else if ($(figure).is("img")) {
                        // If the figure is an image, wrap it in a div and add the
                        // caption to the end of the div
                        $(figure).wrap($("<div class='figure'></div>")).append(capt);
                    } else {
                        // Otherwise, just add the caption after the figure
                        $(figure).after(capt);
                    }
                });

                // Update all anchors with empty content that reference a figure ID
                $("a[href]", doc).each(function (i, anchor) {
                    var id = $(anchor).attr("href").slice(1);   // remove '#' from '#fig-title'
                    if (figMap[id]) {
                        progress("fig reference to " + anchor);
                        $(anchor).addClass('fig-ref');

                        if ($(anchor).html() == '') {
                            progress("append  " + figMap[id]);
                            $(anchor).append(figMap[id].clone());
                        }
                    }
                });
                
                // Create a Table of Figures if a section with id 'tof' exists.
                if (!tof.empty) {
                    $("section#tof", doc).each(function (i, sec) {
                        $(sec).append($("<h2 class='introductory'>Table of Figures</h2>"));
                        $(sec).append($("<ol class='tof'/>"));
                        var $ul = $(sec).children("ol");
                        for (var i = 0; i < tof.length; i++) {
                            $ul.append(tof[i]);
                        }
                      });
                }

                cb();
            },
            ieDummy: 1
        };
    }
);
