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
      ja3: process.env.CYCLETLS_JA3 ?? "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,35-16-43-18-23-17613-10-51-0-65281-5-13-27-11-45-65037,4588-29-23-24,0",
      userAgent: config.userAgent,
      http2Fingerprint: process.env.CYCLETLS_HTTP2_FINGERPRINT ?? "1:65536;2:0;4:6291456;6:262144|15663105|0|m,a,s,p",
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
