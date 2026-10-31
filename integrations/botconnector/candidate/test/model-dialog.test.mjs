import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { BCCLI_MODEL_DIALOG } from '../model-dialog.mjs';
import { patchModelDialog } from '../branding.mjs';

function harness({
  models = ['glm-5.3-flash', 'gpt-5.6-sol', 'qwen3.8-max'],
  switchFails = false,
  persistScope,
} = {}) {
  let index = 0,
    input,
    didEffect = false,
    closed = 0;
  const states = [];
  const calls = [];
  let activeModel = 'glm-5.3-flash';
  const settings = {
    values: {},
    setValue(scope, key, value) {
      this.values[key] = value;
    },
  };
  const fakeFetch = async (url, options = {}) => {
    calls.push({
      url,
      method: options.method || 'GET',
      payload: options.body ? JSON.parse(options.body) : null,
    });
    if (url.endsWith('/v1/models'))
      return Response.json({ data: models.map((id) => ({ id })) });
    if (url.endsWith('/bccli/providers'))
      return Response.json({
        providers: [{ id: 'botconnector', active: true }],
        active: 'botconnector',
      });
    if (url.endsWith('/bccli/provider/switch')) {
      if (switchFails)
        return Response.json({ error: 'gateway unavailable' }, { status: 502 });
      const body = JSON.parse(options.body);
      return Response.json({ provider: body.provider, model: body.model });
    }
    return Response.json({ error: 'unknown' }, { status: 404 });
  };
  const react = {
    useState(initial) {
      const at = index++;
      if (!states[at])
        states[at] = { v: typeof initial === 'function' ? initial() : initial };
      return [
        states[at].v,
        (value) => {
          states[at].v =
            typeof value === 'function' ? value(states[at].v) : value;
        },
      ];
    },
    useEffect(effect) {
      if (!didEffect) {
        didEffect = true;
        effect();
      }
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const config = {
    getModel: () => activeModel,
    async setModel(id) {
      activeModel = id;
    },
  };
  const context = {
    import_react31: react,
    import_jsx_runtime36: { jsx, jsxs: jsx },
    Box_default: 'Box',
    Text: 'Text',
    theme: {
      border: { default: 'grey' },
      text: { primary: 'white', secondary: 'grey', link: 'cyan' },
      status: { error: 'red' },
    },
    useConfig: () => config,
    useSettings: () => settings,
    persistModelSelection: (s, modelId, baseUrl, scope) => {
      s.setValue(scope, 'model.name', modelId);
      s.setValue(scope, 'model.baseUrl', baseUrl ?? '');
    },
    useKeypress: (callback) => {
      input = callback;
    },
    process: {
      env: {
        OPENAI_BASE_URL: 'http://127.0.0.1:43434/v1',
        OPENAI_API_KEY: 'EPHEMERAL_LOCAL_TEST_TOKEN',
      },
    },
    fetch: fakeFetch,
    AbortSignal,
  };
  const stub =
    'function UpstreamModelDialog(props){return {upstream:props.mode}}';
  const { BccliModelPicker, ModelDialog } = vm.runInNewContext(
    stub + '\n' + BCCLI_MODEL_DIALOG + '\n({BccliModelPicker,ModelDialog})',
    context,
  );
  const onClose = () => {
    closed += 1;
  };
  const render = () => {
    index = 0;
    return BccliModelPicker({ onClose, persistScope });
  };
  const flatten = (node, out = []) => {
    if (node == null) return out;
    if (Array.isArray(node)) {
      node.forEach((n) => flatten(n, out));
      return out;
    }
    if (typeof node === 'string' || typeof node === 'number') {
      out.push(String(node));
      return out;
    }
    if (node.props && 'children' in node.props)
      flatten(node.props.children, out);
    return out;
  };
  const wait = () => new Promise((resolve) => setTimeout(resolve, 15));
  const text = () => flatten(render()).join('\n');
  const key = async (name, sequence = '') => {
    input({ name, sequence, ctrl: false, meta: false });
    await wait();
    return flatten(render()).join('\n');
  };
  const start = async () => {
    render();
    await wait();
    return flatten(render()).join('\n');
  };
  return {
    ModelDialog,
    text,
    key,
    wait,
    start,
    calls,
    getClosed: () => closed,
    getModel: () => activeModel,
    getPersisted: (key) => settings.values[key],
  };
}

test('the BCCLI model picker lists the gateway catalog with an active model marker', async () => {
  const x = harness();
  const shown = await x.start();
  assert.match(shown, /BCCLI \| Select model/);
  assert.match(shown, /Search model: \(all\)/);
  assert.match(shown, /gpt-5\.6-sol/);
  assert.match(shown, /glm-5\.3-flash {2}\[ACTIVE\]/);
  assert.match(shown, /Search models \(3\/3\)/);
});

test('typing filters the list and the row count, without touching the model', async () => {
  const x = harness();
  await x.start();
  await x.key('g', 'g');
  await x.key('p', 'p');
  const shown = await x.key('t', 't');
  assert.match(shown, /Search model: gpt/);
  assert.match(shown, /gpt-5\.6-sol/);
  assert.doesNotMatch(shown, /qwen3\.8-max/);
  assert.match(shown, /Search models \(1\/3\)/);
  assert.equal(x.getModel(), 'glm-5.3-flash');
});

test('a search with no hits says so and keeps the dialog open', async () => {
  const x = harness();
  await x.start();
  for (const letter of 'zzz') await x.key(letter, letter);
  assert.match(x.text(), /No models match the search\. Backspace to adjust\./);
  assert.equal(x.getClosed(), 0);
});

test('backspace widens the filtered list again', async () => {
  const x = harness();
  await x.start();
  for (const letter of 'qwen') await x.key(letter, letter);
  assert.match(x.text(), /Search models \(1\/3\)/);
  await x.key('backspace');
  assert.match(x.text(), /Search model: qwe/);
  // "qwe" still matches qwen3.8-max, so the count stays at one.
  assert.match(x.text(), /Search models \(1\/3\)/);
});

test('Enter on a filtered row switches the model and records it with the gateway', async () => {
  const x = harness();
  await x.start();
  for (const letter of 'qwen') await x.key(letter, letter);
  await x.key('down');
  assert.match(x.text(), /❯ qwen3\.8-max/);
  await x.key('return');
  await x.wait();
  assert.equal(x.getModel(), 'qwen3.8-max');
  assert.equal(x.getClosed(), 1);
  assert.deepEqual(x.calls.at(-1).payload, {
    action: 'user-selected-provider',
    provider: 'botconnector',
    model: 'qwen3.8-max',
  });
});

test('a selected model is persisted to the engine settings for the next launch', async () => {
  const x = harness();
  await x.start();
  for (const letter of 'qwen') await x.key(letter, letter);
  await x.key('return');
  await x.wait();
  assert.equal(x.getModel(), 'qwen3.8-max');
  assert.equal(x.getPersisted('model.name'), 'qwen3.8-max');
  assert.equal(
    x.getPersisted('model.baseUrl'),
    'http://127.0.0.1:43434/v1',
  );
});

test('a failed gateway record does not persist the selection', async () => {
  const x = harness({ switchFails: true });
  await x.start();
  await x.key('down');
  await x.key('return');
  await x.wait();
  assert.equal(x.getModel(), 'glm-5.3-flash');
  assert.equal(x.getPersisted('model.name'), undefined);
});

test('a failed gateway record rolls the model back and reports it', async () => {
  const x = harness({ switchFails: true });
  await x.start();
  await x.key('down');
  await x.key('return');
  await x.wait();
  assert.equal(x.getModel(), 'glm-5.3-flash');
  assert.equal(x.getClosed(), 0);
  assert.match(x.text(), /Model selection was not saved/);
});

test('Escape clears the search before it closes the dialog', async () => {
  const x = harness();
  await x.start();
  await x.key('g', 'g');
  assert.match(x.text(), /Search model: g/);
  assert.equal(x.getClosed(), 0);
  await x.key('escape');
  await x.key('escape');
  assert.match(x.text(), /Search model: \(all\)/);
  assert.equal(x.getClosed(), 0);
  await x.key('escape');
  assert.equal(x.getClosed(), 1);
});

test('the auxiliary pickers keep the upstream dialog', () => {
  const x = harness();
  const fast = x.ModelDialog({ isFastModelMode: true, mode: 'fast' });
  const primary = x.ModelDialog({ mode: 'primary' });
  assert.equal(fast.type.name, 'UpstreamModelDialog');
  assert.equal(fast.props.mode, 'fast');
  assert.equal(primary.type.name, 'BccliModelPicker');
});

test('the branding patch renames the upstream dialog and injects the searchable one', () => {
  const upstream =
    'function ModelDialog({onClose}){return 1}__name(ModelDialog,"ModelDialog");';
  const patched = patchModelDialog(upstream);
  assert.match(patched, /function BccliModelPicker\(props\)/);
  assert.match(patched, /function UpstreamModelDialog\(/);
  assert.match(patched, /Search model: /);
  assert.match(
    patched,
    /function UpstreamModelDialog\(\{onClose\}\)\{return 1\}/,
  );
  assert.equal(patched.split('function ModelDialog(props)').length - 1, 1);
});

test('the branding patch fails loudly when the upstream dialog moves', () => {
  assert.throws(
    () =>
      patchModelDialog(
        'function SomethingElse(){}__name(SomethingElse,"SomethingElse");',
      ),
    /model picker upstream rename/,
  );
});
