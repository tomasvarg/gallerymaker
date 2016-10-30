# Gallery Maker for Node

A Node based static html gallery maker.

## Usage

```
Usage: gallerymaker <command> <source dir> [<dest dir>]

  <dest dir> will be sanitized <source dir> + ".web" suffix if not provided.

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
    - list the images (thumbnail based)
    - use some lightbox on the prepared directory
- further development
    - integration with other projects (iframe? ajax? web component? Polymer?)
    - ~~config.json support (for specifying conversion settings)~~

## Attributions

Image processing done by [sharp](http://sharp.dimens.io/) ([github](https://github.com/lovell/sharp)).
