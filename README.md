# Gallery Maker for Node

Node based static html gallery maker.

## Usage

```
Usage: gallerymaker <command> <source dir> [<dest dir>]

  <dest dir> defaults to sanitized <source dir> + ".web" if not provided.

Commands:
  prepare       Prepares gallery file structure based on the <source dir>
                with sanitized names and resized images (see config.json for
                conversion settings) in <dest dir>;
                creates contents.json with original to sanitized names map
                as a source for image captions.
  list          Prepares gallery contents list html (list.html).
  gallery       Prepares gallery contents html (gallery.html).
  all           Runs all the commands (properly chanined - prepare first).
```

## TODO

- ~~image processing test~~
    - ~~read images from a dir~~
    - ~~resize the images~~
    - ~~save them with sanitized names~~
- create html frontend for file list
    - ~~list the images (text based)~~
    - provide &lt;img/> tag literals for copy-pasting
- create the gallery
    - ~~list the images (thumbnail based)~~
    - generate & use actual thumbnails
    - ~~group entries of the same level beginning with four numbers (a year) together & sort them desc~~
    - ~~list files before directories (on the same level)~~
    - list non-image files before images
    - ~~use some lightbox on the prepared directory~~
- further development
    - ~~style the stuff a bit~~
    - integration with other projects (iframe? ajax? web component? Polymer?)
    - ~~config.json support (for specifying conversion settings)~~

## Attributions

Image processing done by [sharp](http://sharp.dimens.io/) ([github](https://github.com/lovell/sharp)).  
Gallery frontend uses [jsOnlyLightbox](http://jslightbox.felixhagspiel.de/) ([github](https://github.com/felixhagspiel/jsOnlyLightbox)).
