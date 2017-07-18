import AWSXRay from 'aws-xray-sdk-core';

const mwUtils = AWSXRay.middleware;
const IncomingRequestData = mwUtils.IncomingRequestData;
const Segment = AWSXRay.Segment;

export default defaultName => {
	if (!defaultName || typeof defaultName !== 'string') {
		throw new Error(
			'Default segment name was not supplied. Please provide a string.'
		);
	}

	mwUtils.setDefaultName(defaultName);

	return async (ctx, next) => {
		// These are Node.js native HTTP request and response objects. Avoid
		// using these directly. These are defined to be compatible with
		// aws-xray-sdk-express.
		const req = ctx.req;
		const res = ctx.res;

		// These are Koa's request and response objects. These should be used
		// wherever possible.
		const request = ctx.request;
		const response = ctx.response;

		// Start the AWS XRay trace.
		const amznTraceHeader = mwUtils.processHeaders(req);
		const name = mwUtils.resolveName(req.headers.host);
		const segment = new Segment(
			name,
			amznTraceHeader.Root,
			amznTraceHeader.Parent
		);

		// TODO: Using res (see above).
		mwUtils.resolveSampling(amznTraceHeader, segment, res);
		segment.addIncomingRequestData(new IncomingRequestData(req));

		AWSXRay.getLogger().debug(
			'Starting express segment: { url: ' +
				req.url +
				', name: ' +
				segment.name +
				', trace_id: ' +
				segment.trace_id +
				', id: ' +
				segment.id +
				', sampled: ' +
				!segment.notTraced +
				' }'
		);

		// Run all other registered middleware.
		req.segment = segment;

		try {
			if (next) {
				await next();
			}

			// Close off the AWS XRay tracing.
			if (response.status === 429) {
				segment.addThrottleFlag();
			}

			if (AWSXRay.utils.getCauseTypeFromHttpStatus(response.status)) {
				segment[
					AWSXRay.utils.getCauseTypeFromHttpStatus(response.status)
				] = true;
			}

			segment.close();
			AWSXRay.getLogger().debug(
				'Closed express segment successfully: { url: ' +
					req.url +
					', name: ' +
					segment.name +
					', trace_id: ' +
					segment.trace_id +
					', id: ' +
					segment.id +
					', sampled: ' +
					!segment.notTraced +
					' }'
			);
		} catch (err) {
			// Close off the AWS XRay tracing.
			segment.close(err);
			AWSXRay.getLogger().debug(
				'Closed express segment with error: { url: ' +
					req.url +
					', name: ' +
					segment.name +
					', trace_id: ' +
					segment.trace_id +
					', id: ' +
					segment.id +
					', sampled: ' +
					!segment.notTraced +
					' }'
			);
			throw err;
		}
	};
};
