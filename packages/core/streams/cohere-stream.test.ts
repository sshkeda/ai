import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  CohereStream,
  StreamingTextResponse,
  experimental_StreamData,
} from '.';
import { cohereChunks } from '../tests/snapshots/cohere';
import { readAllChunks } from '../tests/utils/mock-client';
import { DEFAULT_TEST_URL, createMockServer } from '../tests/utils/mock-server';

const server = createMockServer([
  {
    url: DEFAULT_TEST_URL,
    chunks: cohereChunks,
    formatChunk: chunk => `${JSON.stringify(chunk)}\n`,
  },
]);

describe('CohereStream', () => {
  beforeAll(() => {
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('should be able to parse SSE and receive the streamed response', async () => {
    const stream = CohereStream(await fetch(DEFAULT_TEST_URL));

    const response = new StreamingTextResponse(stream);

    expect(await readAllChunks(response)).toEqual([
      ' Hello',
      ',',
      ' world',
      '.',
      ' ',
    ]);
  });

  describe('StreamData protocol', () => {
    it('should send text', async () => {
      const data = new experimental_StreamData();

      const stream = CohereStream(await fetch(DEFAULT_TEST_URL), {
        onFinal() {
          data.close();
        },
        experimental_streamData: true,
      });

      const response = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(response)).toEqual([
        '0:" Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
        '0:" "\n',
      ]);
    });

    it('should send text and data', async () => {
      const data = new experimental_StreamData();

      data.append({ t1: 'v1' });

      const stream = CohereStream(await fetch(DEFAULT_TEST_URL), {
        onFinal() {
          data.close();
        },
        experimental_streamData: true,
      });

      const response = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(response)).toEqual([
        '2:[{"t1":"v1"}]\n',
        '0:" Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
        '0:" "\n',
      ]);
    });
  });
});
