/**
 * JetAPI Test Runner
 * 
 * Executes user-written test scripts against API responses.
 * Provides a Postman-compatible `pm` API for writing assertions.
 */

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface PmResponse {
  code: number;
  status: string;
  headers: Record<string, string>;
  responseTime: number;
  responseSize: number;
  json: () => any;
  text: () => string;
  to: {
    have: {
      status: (code: number) => void;
      header: (name: string, value?: string) => void;
      jsonBody: (key?: string) => void;
      body: (text: string) => void;
    };
    be: {
      ok: void;
      success: void;
      info: void;
      redirection: void;
      clientError: void;
      serverError: void;
    };
    not: {
      have: {
        status: (code: number) => void;
      };
    };
  };
}

/**
 * Run test script in a sandboxed context with a `pm` helper object.
 */
export function runTestScript(
  script: string,
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: any;
    timeMs: number;
    size: number;
  }
): TestResult[] {
  if (!script || !script.trim()) return [];

  const results: TestResult[] = [];

  // Build the `pm.response.to.have/be` chain using getters and methods
  const buildResponseAssertions = () => {
    let currentError: string | null = null;

    const haveObj = {
      status: (code: number) => {
        if (response.status !== code) {
          throw new Error(`Expected status ${code}, got ${response.status}`);
        }
      },
      header: (name: string, value?: string) => {
        const headerVal = response.headers?.[name.toLowerCase()] || response.headers?.[name];
        if (headerVal === undefined) {
          throw new Error(`Expected header "${name}" to exist`);
        }
        if (value !== undefined && headerVal !== value) {
          throw new Error(`Expected header "${name}" to be "${value}", got "${headerVal}"`);
        }
      },
      jsonBody: (key?: string) => {
        const body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        if (body === null || body === undefined || typeof body !== 'object') {
          throw new Error('Expected response to have JSON body');
        }
        if (key !== undefined && !(key in body)) {
          throw new Error(`Expected JSON body to have key "${key}"`);
        }
      },
      body: (text: string) => {
        const bodyStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        if (!bodyStr.includes(text)) {
          throw new Error(`Expected body to contain "${text}"`);
        }
      },
    };

    const notHaveObj = {
      status: (code: number) => {
        if (response.status === code) {
          throw new Error(`Expected status NOT to be ${code}`);
        }
      },
    };

    const beObj: Record<string, any> = {};
    Object.defineProperties(beObj, {
      ok: {
        get() {
          if (response.status < 200 || response.status >= 300) {
            throw new Error(`Expected 2xx status, got ${response.status}`);
          }
        },
      },
      success: {
        get() {
          if (response.status < 200 || response.status >= 300) {
            throw new Error(`Expected 2xx status, got ${response.status}`);
          }
        },
      },
      info: {
        get() {
          if (response.status < 100 || response.status >= 200) {
            throw new Error(`Expected 1xx status, got ${response.status}`);
          }
        },
      },
      redirection: {
        get() {
          if (response.status < 300 || response.status >= 400) {
            throw new Error(`Expected 3xx status, got ${response.status}`);
          }
        },
      },
      clientError: {
        get() {
          if (response.status < 400 || response.status >= 500) {
            throw new Error(`Expected 4xx status, got ${response.status}`);
          }
        },
      },
      serverError: {
        get() {
          if (response.status < 500 || response.status >= 600) {
            throw new Error(`Expected 5xx status, got ${response.status}`);
          }
        },
      },
    });

    return { have: haveObj, be: beObj, not: { have: notHaveObj } };
  };

  const pmResponse: any = {
    code: response.status,
    status: response.statusText,
    headers: response.headers || {},
    responseTime: response.timeMs || 0,
    responseSize: response.size || 0,
    json: () => {
      if (typeof response.data === 'string') {
        try { return JSON.parse(response.data); } catch { return null; }
      }
      return response.data;
    },
    text: () => {
      return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    },
    ...buildResponseAssertions(),
  };

  // Add `to` property that returns the assertion chain
  pmResponse.to = buildResponseAssertions();

  const pm = {
    test: (name: string, fn: () => void) => {
      try {
        fn();
        results.push({ name, passed: true });
      } catch (err: any) {
        results.push({ name, passed: false, error: err.message || String(err) });
      }
    },
    expect: (value: any) => {
      return {
        to: {
          equal: (expected: any) => {
            if (value !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
          },
          eql: (expected: any) => {
            if (JSON.stringify(value) !== JSON.stringify(expected)) {
              throw new Error(`Expected deep equal ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
            }
          },
          be: {
            a: (type: string) => {
              if (typeof value !== type) throw new Error(`Expected type "${type}", got "${typeof value}"`);
            },
            an: (type: string) => {
              if (typeof value !== type) throw new Error(`Expected type "${type}", got "${typeof value}"`);
            },
            below: (n: number) => {
              if (value >= n) throw new Error(`Expected ${value} to be below ${n}`);
            },
            above: (n: number) => {
              if (value <= n) throw new Error(`Expected ${value} to be above ${n}`);
            },
            true: (() => { if (value !== true) throw new Error(`Expected true, got ${value}`); }) as any,
            false: (() => { if (value !== false) throw new Error(`Expected false, got ${value}`); }) as any,
            null: (() => { if (value !== null) throw new Error(`Expected null, got ${value}`); }) as any,
            undefined: (() => { if (value !== undefined) throw new Error(`Expected undefined, got ${value}`); }) as any,
          },
          have: {
            property: (prop: string) => {
              if (value === null || value === undefined || !(prop in value)) {
                throw new Error(`Expected object to have property "${prop}"`);
              }
            },
            length: (len: number) => {
              if (!value || value.length !== len) {
                throw new Error(`Expected length ${len}, got ${value?.length}`);
              }
            },
            lengthOf: (len: number) => {
              if (!value || value.length !== len) {
                throw new Error(`Expected length ${len}, got ${value?.length}`);
              }
            },
          },
          include: (item: any) => {
            if (typeof value === 'string') {
              if (!value.includes(item)) throw new Error(`Expected "${value}" to include "${item}"`);
            } else if (Array.isArray(value)) {
              if (!value.includes(item)) throw new Error(`Expected array to include ${JSON.stringify(item)}`);
            } else {
              throw new Error(`Cannot check include on ${typeof value}`);
            }
          },
          not: {
            equal: (expected: any) => {
              if (value === expected) throw new Error(`Expected NOT ${JSON.stringify(expected)}`);
            },
            be: {
              null: (() => { if (value === null) throw new Error('Expected NOT null'); }) as any,
              undefined: (() => { if (value === undefined) throw new Error('Expected NOT undefined'); }) as any,
            },
          },
        },
      };
    },
    response: pmResponse,
  };

  // Execute the script in a sandboxed function scope
  try {
    const fn = new Function('pm', 'console', script);
    fn(pm, console);
  } catch (err: any) {
    results.push({
      name: 'Script Execution Error',
      passed: false,
      error: err.message || String(err),
    });
  }

  return results;
}
