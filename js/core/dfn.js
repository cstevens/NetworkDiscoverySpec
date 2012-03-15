// XXX untested
define(
    [],
    function () {
        return {
            run:    function (conf, doc, cb) {
                progress("handling dfn");

                doc.normalize();
                var dfnMap = {};
                $("dfn").each(function (i, dfn) {
                    var title = $(dfn).dfnTitle();
                    dfnMap[title] = $(dfn).makeID("dfn", title);
                });

                $("a:not([href])").each(function (i, ant) {
                    var $ant = $(ant);
                    if ($ant.hasClass("externalDFN")) return;
                    var title = $ant.dfnTitle();
                    if (dfnMap[title] && !(dfnMap[title] instanceof Function)) {
                        $ant.attr("href", "#" + dfnMap[title]).addClass("internalDFN");
                    }
                });

                cb();
            },
            ieDummy: 1
        };
    }
);
