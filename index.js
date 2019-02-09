#!/usr/bin/env node

require(`loud-rejection`)()
const pify = require(`pify`)
const pMap = require(`p-map`)

const listDir = pify(require(`list-directory-contents`))
const mri = require(`mri`)
const matcher = require(`matcher`)
const makeDir = require(`make-dir`)

const makeRenderer = require(`noddity-lazy-static-render`)
const Butler = require(`noddity-butler`)

const level = require(`level-mem`)
const { readFile, writeFile } = pify(require(`fs`))
const path = require(`path`)

const makeFsRetrieval = require(`noddity-fs-retrieval`)

const help = () => console.log(`generate-noddity [options] [pattern ...]
Options:
--root       the directory to scrape for posts.  Defaults to the current working directory
--template   (required) the template html file content should be injected into.  The file should contain '{{{html}}}'
--output     (required) the directory where the html files should be created
--extension  the extension to be used on the output files.  Defaults to 'html'
pattern      patterns to match files against.  Defaults to '*.md'
`)

const cli = async(...argv) => {
	const args = mri(argv, {
		alias: {
			patterns: `_`,
			templateFile: `template`,
		},
		defaults: {
			root: process.cwd(),
			extension: `html`,
		},
	})

	if (args.patterns.length === 0) {
		args.patterns = [ `*.md` ]
	}

	if (!args.output || !args.template) {
		help()
	} else {
		return generate(args)
	}
}

const generate = async({ root, output, templateFile, patterns, extension }) => {
	const [
		indexHtml,
		allFiles,
	] = await Promise.all([
		readFile(templateFile, { encoding: `utf8` }),
		listDir(root),
	])

	await makeDir(output)

	const files = matcher(allFiles, patterns).map(file => path.relative(root, file))

	const { getPost } = makeFsRetrieval(root)

	const retrieval = {
		getIndex(cb) {
			process.nextTick(cb, null, files)
		},
		getPost,
	}

	const butler = new Butler(retrieval, level())

	const render = makeRenderer({
		butler,
		indexHtml,
		data: {

		},
	})

	await pMap(files, async file => {
		try {
			const html = await render({ file })

			const { dir, name } = path.parse(path.join(output, file))

			const outputPath = path.format({
				dir,
				name,
				ext: `.` + extension,
			})

			await writeFile(outputPath, html)
		} catch (err) {
			console.error(`Error rendering`, file)
			throw err
		}
	}, { concurrency: 4 })
}




const [ ,, ...argv ] = process.argv

cli(...argv)
