// XXX untested
// @@ CONFIG
//      - specStatus
define(
    ["core/utils"],
    function (utils) {
        return {
            run:    function (conf, doc, cb) {
                progress("inserting W3C CSS");
                if (!conf.specStatus) error("Configuration specStatus is not set, required for w3c/style");
                var statStyle = conf.specStatus;
                if (statStyle == "FPWD" || statStyle == "LC") statStyle = "WD";
                var css;
                if (statStyle == "unofficial") {
                    css = "http://www.w3.org/StyleSheets/TR/w3c-unofficial";
                }
                else if (statStyle == "base") {
                    css = "http://www.w3.org/StyleSheets/TR/base";
                }
                else {
                    css = "http://www.w3.org/StyleSheets/TR/W3C-" + statStyle + ".css";
                }
                utils.linkCSS(doc, css);
                cb();
            },
            ieDummy: 1
        };
    }
);
