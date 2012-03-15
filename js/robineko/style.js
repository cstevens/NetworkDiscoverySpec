define(
    ["text!robineko/css/base.css"],
    function (css) {
        return {
            run:    function (conf, doc, cb) {
                $("<style/>").appendTo($("head", $(doc)))
                             .attr("type", "text/css")
                             .text(css);
                cb();
            },
            ieDummy: 1
        };
    }
);
