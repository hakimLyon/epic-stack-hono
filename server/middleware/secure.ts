import { type Context, type Next } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { IS_DEV } from './misc.ts'

const secureHeadersConfig = secureHeaders({
	referrerPolicy: 'same-origin',
	crossOriginEmbedderPolicy: false,
	contentSecurityPolicy: {
		connectSrc: [
			IS_DEV ? 'ws:' : null,
			process.env.SENTRY_DSN ? '*.sentry.io' : null,
			"'self'",
		].filter(Boolean),
		fontSrc: ["'self'"],
		frameSrc: ["'self'"],
		imgSrc: ["'self'", 'data:'],
		mediaSrc: ["'self'", 'data:'],
		scriptSrc: [
			"'strict-dynamic'",
			"'self'",
			(c, _) => `'nonce-${c.get('cspNonce')}'`,
		],
		scriptSrcAttr: [(c, _) => `'nonce-${c.get('cspNonce')}'`],
	},
})

export const secureHeadersMiddleware = async (c: Context, next: Next) => {
	await next()
	// Check if the response is HTML before applying the CSP headers
	if (c.res.headers.get('Content-Type')?.includes('text/html')) {
		await secureHeadersConfig(c, () => Promise.resolve())
	}
}
