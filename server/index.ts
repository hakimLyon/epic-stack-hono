// generated by react-router-hono-server/dev
import Sentry from '@sentry/remix'
import { compress } from 'hono/compress'
import { createMiddleware } from 'hono/factory'

import { poweredBy } from 'hono/powered-by'
import { createHonoServer } from 'react-router-hono-server/node'
import { cspNonceMiddleware } from './middleware/cspnonce.ts'
import { epicLogger } from './middleware/epic-logger.ts'
import { ALLOW_INDEXING, IS_PROD } from './middleware/misc.ts'
import { rateLimitMiddleware } from './middleware/rate-limit.ts'
import { removeTrailingSlash } from './middleware/remove-trailing_slash.ts'
import { secureHeadersMiddleware } from './middleware/secure.ts'

const SENTRY_ENABLED = IS_PROD && process.env.SENTRY_DSN

if (SENTRY_ENABLED) {
	void import('./utils/monitoring.ts').then(({ init }) => init())
}

if (process.env.MOCKS === 'true') {
	await import('../tests/mocks/index.ts')
}

export default await createHonoServer({
	defaultLogger: false,
	getLoadContext: (c, _) => ({ cspNonce: c.get('cspNonce') }),

	configure: (server) => {
		/**
		 * 1. Removing trailing slashes
		 *    - Cleans up URLs to avoid downstream issues.
		 */
		server.use(removeTrailingSlash)

		/**
		 * 2. Redirecting HTTP to HTTPS
		 *    - Redirects HTTP requests to HTTPS immediately after normalization.
		 */
		server.use('*', async (c, next) => {
			const proto = c.req.header('X-Forwarded-Proto')
			const host = c.req.header('Host')
			if (proto === 'http') {
				const secureUrl = `https://${host}${c.req.url}`
				return c.redirect(secureUrl, 301)
			}
			await next()
		})

		/**
		 * 4. CSP Nonce Middleware
		 *    - Provides a nonce to secure scripts.
		 */
		server.use(cspNonceMiddleware)

		/**
		 * 3. Secure headers
		 *    - Applies secure HTTP headers at the start of the cycle.
		 */
		server.use('*', secureHeadersMiddleware)

		/**
		 * 5. Rate limiting
		 *    - Protects the server by limiting excessive requests per IP.
		 */
		server.use('*', rateLimitMiddleware)

		/**
		 * 6. Custom logger
		 *    - Captures all requests for logging once security measures are in place.
		 */
		server.use('*', epicLogger())

		/**
		 * 7.poweredBy
		 *    - Add a powered by header to the response
		 */

		server.use('*', poweredBy({ serverName: 'EPIC STACK' }))

		/**
		 * 8. Specific routes (quick handling of 404 errors)
		 *    - Quickly handles defined routes like `/favicons/*` or `/img/*`.
		 */
		server.on('GET', ['/favicons/*', '/img/*'], (c) => {
			return c.text('Not found', 404)
		})

		/**
		 * 9. Response compression
		 *    - Placed here to optimize response size after all processing.
		 */
		server.use(compress())

		/**
		 * 10. Search engine indexing
		 *     - Adds or blocks indexing rules after response generation.
		 */
		if (!ALLOW_INDEXING) {
			server.use(
				createMiddleware(async (c, next) => {
					c.set('X-Robots-Tag', 'noindex, nofollow')
					await next()
				}),
			)
		}

		/**
		 * 11. Global error handling
		 *     - Captures all unhandled errors and logs them.
		 */
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