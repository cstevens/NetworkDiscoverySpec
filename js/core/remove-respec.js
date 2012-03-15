// XXX untested
define(
    [],
    function () {
        return {
            run:    function (conf, doc, cb) {
                progress("removing ReSpec markup");
                // $(".remove, script[data-requiremodule]", $(doc)).remove();
                // this is a hack that knows that bibrefs are loaded async and thus can't be killed here
                // but I couldn't think of a better way
                $(".remove, script[data-requiremodule]:not([data-requiremodule*=\"/bibref/\"])", $(doc)).remove();
                cb();
            },
            ieDummy: 1
        };
    }
);
