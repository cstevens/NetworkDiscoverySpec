
require([
            // must be first
            "core/base-runner",
            "core/utils",
            
            // modules that are used by the profile
            "core/default-root-attr",
            "core/style",
            "w3c/style",
            "w3c/headers",
            "core/data-transform", // done REALLY early in case the transform ends up needing to include something
            "core/data-include",
            "core/inlines",
            "core/webidl",
            "core/examples",
            "w3c/bibref",
            "core/structure",
            "w3c/structure",
            "core/figure",
            "core/dfn",
            // these at the end
            "core/rdfa",
            "w3c/unhtml5",
            "core/remove-respec"
        ], 
        function (runner) { runner.runAll(Array.prototype.slice.call(arguments)); }
);
