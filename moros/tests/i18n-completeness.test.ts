import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const file = new URL("../src/renderer/src/i18n.ts", import.meta.url);
const sourceText = readFileSync(file, "utf8");
const source = ts.createSourceFile(file.pathname, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function literalDictionary(name: string): Map<string, string> {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name || !declaration.initializer) continue;
      const initializer = unwrap(declaration.initializer);
      assert.ok(ts.isObjectLiteralExpression(initializer), `${name} must remain an explicit object literal`);
      const entries = new Map<string, string>();
      for (const property of initializer.properties) {
        assert.ok(ts.isPropertyAssignment(property), `${name} may only contain explicit property assignments`);
        const key = property.name;
        assert.ok(ts.isStringLiteral(key), `${name} keys must be string literals`);
        assert.ok(ts.isStringLiteralLike(property.initializer), `${name}.${key.text} must be a string literal`);
        entries.set(key.text, property.initializer.text);
      }
      return entries;
    }
  }
  throw new Error(`Dictionary ${name} was not found`);
}

test("every translated dictionary is explicit and covers every canonical key", () => {
  const canonical = literalDictionary("zhCN");
  for (const locale of ["zhTW", "en", "de"]) {
    const dictionary = literalDictionary(locale);
    assert.deepEqual([...dictionary.keys()].sort(), [...canonical.keys()].sort());
    assert.deepEqual(
      [...dictionary].filter(([key, value]) => key === value),
      [],
      `${locale} contains raw translation-key fallbacks`,
    );
  }
});

test("connected provider accessibility copy is translated", () => {
  assert.equal(literalDictionary("en").get("settings.connectedProvidersList"), "Connected provider list");
  assert.equal(literalDictionary("de").get("settings.connectedProvidersList"), "Liste verbundener Provider");
  assert.doesNotMatch(sourceText, /Object\.keys\(zhCN\).*\[key, key\]/s);
});

test("Traditional Chinese uses explicit Taiwan terminology", () => {
  const dictionary = literalDictionary("zhTW");
  assert.equal(dictionary.get("settings.category.personal"), "個人設定");
  assert.equal(
    dictionary.get("settings.nav.dependenciesDescription"),
    "執行環境與命令列工具",
  );
  assert.equal(dictionary.get("settings.connectedProvidersList"), "已連線的 Provider 清單");
  assert.equal(dictionary.get("settings.signIn"), "登入");
  assert.equal(dictionary.get("settings.dependency.phase.extracting"), "下載完成，正在解壓縮…");
  assert.equal(dictionary.get("thread.activity.read.active"), "正在讀取檔案");
  assert.equal(dictionary.get("thread.activity.exploring"), "探索中");

  const corpus = [...dictionary]
    .filter(([key]) => key !== "language.zh-CN")
    .map(([, value]) => value)
    .join("\n");
  assert.doesNotMatch(
    corpus,
    /设置|运行|软件|设备|驱动|登录|列表|搜索|打开|下载|安装|文件|当前|用户|消息|代码|依赖|支持|加载|配置|匹配|查看|恢复|默认|信息|会话|环境|系统|连接|输出|输入|选择|显示|删除|关闭|复制/,
  );
  assert.doesNotMatch(
    sourceText,
    /TRADITIONAL_CHARACTER_PAIRS|toTraditionalText|Object\.assign\(zhTW/,
  );
});
