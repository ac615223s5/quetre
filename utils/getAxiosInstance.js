////////////////////////////////////////////////////////
//                      IMPORTS
////////////////////////////////////////////////////////
import axios from 'axios';
import settle from 'axios/unsafe/core/settle.js';
import initCycleTLS from 'cycletls';
import { Readable } from 'node:stream';

const cycleTLS = await initCycleTLS();

////////////////////////////////////////////////////////
//                     FUNCTION
////////////////////////////////////////////////////////
/**
 * @description an axios instance having base url already set
 * @param {string} lang language to use. default is english.
 * @returns AxiosInstance
 */
const getAxiosInstance = (subdomain = 'www') =>
  axios.create({
    baseURL: `https://${subdomain}.quora.com`,
    // conditionally adding headers to the request config using ES6 spreading and short-circuiting
    headers: {
      ...(process.env.AXIOS_USER_AGENT && {
        'User-Agent': process.env.AXIOS_USER_AGENT,
      }),
      ...(process.env.ACCEPT && {
        Accept: process.env.ACCEPT,
      }),
    },
    adapter: axiosCycleTlsAdapter,
  });

/**
 * Lets axios use CycleTLS for its requests
 * @param {import('axios').InternalAxiosRequestConfig} config 
 */
const axiosCycleTlsAdapter = (config) => {
  return new Promise(async (res, rej) => {
    const uri = new URL(config.url, config.baseURL);
    const cycleResponse = await cycleTLS(uri, {
      body: config.data,
      headers: config.headers,
      responseType: config.responseType,
      userAgent: config.userAgent,
      ja3: process.env.CYCLETLS_JA3,
      ja4r: process.env.CYCLETLS_JA4R,
      http2Fingerprint: process.env.CYCLETLS_HTTP2_FINGERPRINT,
      quicFingerprint: process.env.CYCLETLS_QUIC_FINGERPRINT,
      forceHTTP3: process.env.CYCLETLS_FORCE_HTTP3 === '1',
      proxy: process.env.HTTP_PROXY,
    }, config.method);

    const resp = {
      data: null,
      status: cycleResponse.status,
      statusText: "unknown",
      headers: cycleResponse.headers,
      config,
      request: null,
    };

    switch (config.responseType) {
      // it'd probably be smart to implement all of them
      case undefined:
      case "text": {
        resp.data = await cycleResponse.text();
        break;
      }
      case "stream": {
        resp.data = Readable.fromWeb(cycleResponse.data);
        break;
      }
      default: {
        console.debug("Unhandled type", config.responseType);
      }
    }

    settle(res, rej, resp);
  });
}

////////////////////////////////////////////////////////
//                      EXPORTS
////////////////////////////////////////////////////////
export default getAxiosInstance;
