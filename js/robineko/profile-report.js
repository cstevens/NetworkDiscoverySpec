
require([
            // must be first
            "core/base-runner",
            "core/utils",
            
            // modules that are used by the profile
            "core/default-root-attr",
            "core/style",
            "robineko/style",
            "robineko/headers",
            "core/inlines",
            // "core/webidl",
            "core/examples",
            // bibref
            "core/structure",
            "core/dfn",
            "robineko/add-container",
            // these at the end
            "core/remove-respec"
        ], 
        function (runner) { runner.runAll(Array.prototype.slice.call(arguments)); }
);
