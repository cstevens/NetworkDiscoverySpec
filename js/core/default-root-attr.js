
define(
    [],
    function () {
        return {
            run:    function (config, doc, cb) {
                progress("defaulting root attributes");
    	        var root = $(doc.documentElement);
                if (!root.attr("lang")) root.attr({ lang: "en", dir: "ltr" });
                cb();
            },
            ieDummy: 1
        };
    }
);
