A static site generator for [Noddity](http://noddity.com/) posts.

# Install

You can either

```sh
npm i noddity-generator-cli -g
```

or install locally and use `npx`.

# API

```sh
generate-noddity --root=./my-posts --output=./public *.md *.mmd
```

Arguments:

- `root`: the directory to scrape for posts.  Defaults to the current working directory
- `output` *[required]*: the directory where the `html` files should be created
- `template`: *[required]*: the template html file content should be injected into.  The file should contain `{{{html}}}`
- `data`: path to a js/json file to be 'require'd as the data object
- `filter`: path to a js file exposing a filter function that determines if a post should be included in the index
- `feed`: path to a js/json file containing `urlRoot`, `title`, `author`, `outputFileName`, `feedUrl`
- all other unlabeled arguments are [patterns](https://github.com/sindresorhus/matcher) to match files against.  Defaults to `*.md`

This tool assumes that you have a file named `post` in the root directory, with that `post` file containing `{{{html}}}` in the place where the content should be injected.

# License

[WTFPL](https://wtfpl2.com)
