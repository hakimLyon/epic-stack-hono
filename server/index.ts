import Sentry from '@sentry/remix'
import { compress } from 'hono/compress'
import { createMiddleware } from 'hono/factory'
import { poweredBy } from 'hono/powered-by'
import { Hono } from 'hono/quick'
import { createHonoServer } from 'react-router-hono-server/node'
import { cspNonceMiddleware } from './middleware/cspnonce.ts'
import { epicLogger } from './middleware/epic-logger.ts'
import { ALLOW_INDEXING, IS_DEV, IS_PROD } from './middleware/misc.ts'
import { rateLimitMiddleware } from './middleware/rate-limit.ts'
import { removeTrailingSlash } from './middleware/remove-trailing_slash.ts'
import { secureHeadersMiddleware } from './middleware/secure.ts'

const SENTRY_ENABLED = IS_PROD && process.env.SENTRY_DSN

if (SENTRY_ENABLED) {
	void import('./utils/monitoring.ts').then(({ init }) => init())
}

if (process.env.MOCKS === 'true' && IS_DEV) {
	await import('../tests/mocks/index.ts')
}

export default await createHonoServer({
	app: new Hono(),
	defaultLogger: false,
	getLoadContext: (c, { build }) => ({
		cspNonce: c.get('cspNonce' as never),
		serverBuild: build,
	}),

	configure: (server) => {
		server.use('*', epicLogger())
		server.use(removeTrailingSlash)

		server.use('*', async (c, next) => {
			const proto = c.req.header('X-Forwarded-Proto')
			const host = c.req.header('Host')
			if (proto === 'http') {
				const secureUrl = `https://${host}${c.req.url}`
				return c.redirect(secureUrl, 301)
			}
			await next()
		})

		server.use(cspNonceMiddleware)
		server.use('*', secureHeadersMiddleware)
		server.use('*', rateLimitMiddleware)
		server.use('*', poweredBy({ serverName: 'EPIC STACK' }))

		server.on('GET', ['/favicons/*', '/img/*'], (c) => {
			return c.text('Not found', 404)
		})

		server.use(compress())

		if (!ALLOW_INDEXING) {
			server.use(
				createMiddleware(async (c, next) => {
					c.set('X-Robots-Tag', 'noindex, nofollow')
					await next()
				}),
			)
		}
		server.onError(async (err, c) => {
			console.error(`${err}`)
			if (SENTRY_ENABLED) {
				Sentry.captureException(err)
				await Sentry.flush(500)
			}
			return c.text('Internal Server Error', 500)
		})
	},
})
