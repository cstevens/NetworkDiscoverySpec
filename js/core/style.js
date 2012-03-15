// XXX untested
// @@ CONFIG
//      - noReSpecCSS
// IMPORTANT NOTE
//  The extraCSS configuration option is now deprecated. People rarely use it, and it
//  does not work well with the growing restrictions that browsers impose on loading
//  local content. You can still add your own styles: for that you will have to create
//  a plugin that declares the css as a dependency and create a build of your new
//  ReSpec profile. It's rather easy, really.
define(
    ["core/utils", "text!core/css/respec2.css"],
    function (utils, css) {
        return {
            run:    function (conf, doc, cb) {
                progress("inserting ReSpec CSS");
                if (!conf.noReSpecCSS) {
                    $("<style/>").appendTo($("head", $(doc)))
                                 .attr("type", "text/css")
                                 .text(css);
                }
                cb();
            },
            ieDummy: 1
        };
    }
);
