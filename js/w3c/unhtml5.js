// XXX untested
define(
    [],
    function () {
        return {
            run:    function (conf, doc, cb) {
                progress("unHTML5");
                $("section").each(function (i, sec) {
                    $(sec).addClass("section").renameElement("div");
                });

                cb();
            },
            ieDummy: 1
        };
    }
);
