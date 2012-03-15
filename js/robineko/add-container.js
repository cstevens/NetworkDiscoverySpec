define(
    [],
    function () {
        return {
            run:    function (conf, doc, cb) {
                var $content = $("body > *");
                $content.remove();
                $("<div/>").appendTo($("body"))
                           .attr("id", "container")
                           .append($content);
                cb();
            },
            ieDummy: 1
        };
    }
);
