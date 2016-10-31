(function () {
    'use strict';
    /* global Lightbox */

    addEventListener('DOMContentLoaded', init);

    function init() {
        console.log('index initialized');
        if (Lightbox) {
            var lightbox = new Lightbox();
            lightbox.load();
        }
    }

}());
