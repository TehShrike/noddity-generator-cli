#!/usr/bin/env node

require(`loud-rejection`)()
const pify = require(`pify`)
const pMap = require(`p-map`)
const pFilter = require(`p-filter`)

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
--data       path to a js/json file to be 'require'd as the data object
--filter     path to a js file exposing a filter function that determines if a post should be included in the index
--feed       path to a js/json file containing urlRoot, title, author, outputFileName, feedUrl
pattern      patterns to match files against.  Defaults to '*.md'
`)

const requireCwd = file => require(path.join(process.cwd(), file))

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

const generate = async({
	root,
	output,
	templateFile,
	patterns,
	extension,
	data: dataFile,
	filter: filterFile,
	feed: feedSettingsFile,
}) => {
	const data = dataFile ? requireCwd(dataFile) : {}
	const filter = filterFile ? requireCwd(filterFile) : () => true

	const [
		indexHtml,
		allFiles,
	] = await Promise.all([
		readFile(templateFile, { encoding: `utf8` }),
		listDir(root),
	])

	await makeDir(output)

	const { getPost } = makeFsRetrieval(root)

	const allPaths = matcher(allFiles, patterns)
		.map(file => path.relative(root, file))

	const getPostPromise = pify(getPost)

	const indexFiles = await pFilter(allPaths, async file => {
		const post = await getPostPromise(file)

		return filter(post)
	})

	const retrieval = {
		getIndex(cb) {
			process.nextTick(cb, null, indexFiles)
		},
		getPost,
	}

	const butler = new Butler(retrieval, level())

	const render = makeRenderer({
		butler,
		indexHtml,
		data,
	})

	if (feedSettingsFile) {
		const feedSettings = requireCwd(feedSettingsFile)
		const xml = await generateFeed(Object.assign({
			indexFiles,
			butler,
			getPostPromise,
		}, feedSettings))
		console.log(`writing`, xml.length, `to`, path.join(output, feedSettings.outputFileName))

		await writeFile(path.join(output, feedSettings.outputFileName), xml)
	}

	await pMap(allPaths, async file => {
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

const FEED_TEMPLATE_POST = {
	name: `template`,
	metadata: {
		title: `RSS Template`,
		markdown: false,
	},
	content: `{{>current}}`,
}

const generateFeed = async({
	indexFiles,
	title,
	author,
	feedUrl,
	urlRoot,
	butler,
	getPostPromise,
}) => {
	const url = require(`url`)
	const Rss = require(`rss`)
	const renderStatic = require(`noddity-render-static`)
	const linkify = require(`noddity-linkifier`)(urlRoot)

	const siteRootUrl = url.resolve(urlRoot, ``)
	const rss = new Rss({
		title,
		feed_url: feedUrl,
		site_url: siteRootUrl,
		ttl: 12 * 60,
	})

	const addToFeed = rss.item.bind(rss)

	const postItems = await pMap(indexFiles, async file => {
		const post = await getPostPromise(file)

		const html = await renderStatic(FEED_TEMPLATE_POST, post, {
			butler,
			linkifier: linkify,
			data: {},
		})

		return {
			title: post.metadata.title || post.filename,
			description: html,
			url: dumbResolve(urlRoot, post.filename),
			// Because we're using an empty guid, post URLs must be unique!
			// guid: '',
			author: post.metadata.author || author,
			date: post.metadata.date,
		}
	})

	postItems.forEach(addToFeed)

	return rss.xml()
}

function dumbResolve(firstThingy, secondThingy) {
	const startsWithSlash = firstThingy[firstThingy.length - 1] === `/`
	const separator = startsWithSlash ? `` : `/`

	return firstThingy + separator + secondThingy
}



const [ ,, ...argv ] = process.argv

cli(...argv)
