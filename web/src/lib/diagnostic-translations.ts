/** Presentation-only translations. Persisted messages, identifiers and contracts stay English. */
const exact: Readonly<Record<string, string>> = {
  'Arguments must be a JSON array.': '引数は JSON 配列で入力してください。',
  'Use a JSON array of strings, finite numbers, booleans, or null.':
    '文字列、有限の数値、真偽値、null の JSON 配列を入力してください。',
  'A project must contain exactly one Root.': 'プロジェクトには Root が 1 つ必要です。',
  'Node IDs must be unique.': 'ノード ID が重複しています。',
  'Connection IDs must be unique.': '接続 ID が重複しています。',
  'Variable IDs must be unique.': '変数 ID が重複しています。',
  'Enter a project name.': 'プロジェクト名を入力してください。',
  'Class name must be a valid C# identifier.': 'クラス名には有効な C# 識別子を指定してください。',
  'Class name conflicts with a generated factory method.':
    'クラス名が生成されるファクトリーメソッドと競合しています。',
  'Class name would shadow a runtime namespace.':
    'クラス名がランタイムの名前空間を隠してしまいます。',
  'Use an application namespace outside the reserved System namespaces.':
    '予約済みの System 名前空間以外の名前空間を指定してください。',
  'Class name would redefine a runtime type in this namespace.':
    'この名前空間ではクラス名がランタイムの型と重複します。',
  'Namespace conflicts with a runtime type.': '名前空間がランタイムの型と競合しています。',
  'Class name would redefine a shared contract type in this namespace.':
    'この名前空間ではクラス名が共有コントラクトの型と重複します。',
  'Namespace conflicts with a shared contract type.':
    '名前空間が共有コントラクトの型と競合しています。',
  'Namespace must contain valid C# identifiers separated by dots.':
    '名前空間には有効な C# 識別子をドットで区切って指定してください。',
  'A connection refers to a missing node.': '接続先のノードが存在しません。',
  'A connection references a missing node.': '接続先のノードが存在しません。',
  'A connection already exists.': 'この接続はすでに存在します。',
  'Child order must be a nonnegative integer.': '子ノードの実行順は 0 以上の整数にしてください。',
  'A node cannot connect to itself.': 'ノード自身には接続できません。',
  'Unknown node type.': '不明なノードの種類です。',
  'Root cannot have a parent.': 'Root に親ノードは設定できません。',
  'Root must remain enabled.': 'Root は無効にできません。',
  'A node can have only one parent.': 'ノードに設定できる親は 1 つです。',
  'Children must have unique execution order values.': '子ノードの実行順が重複しています。',
  'Enter a node name.': 'ノード名を入力してください。',
  'Handler name must be a valid C# identifier.':
    'ハンドラー名には有効な C# 識別子を指定してください。',
  'Handler name conflicts with its generated interface name.':
    'ハンドラー名が生成されるインターフェース名と競合しています。',
  'Invalid arguments.': '引数が不正です。',
  'Until failure must be a boolean.': '失敗まで繰り返す設定には真偽値を指定してください。',
  'Log message must be a string.': 'ログメッセージには文字列を指定してください。',
  'Choose a supported HTTP method.': '対応している HTTP メソッドを選択してください。',
  'Enter an HTTP(S) URL without embedded credentials.':
    '認証情報を含まない HTTP(S) URL を入力してください。',
  'Credential environment variable name is invalid.': '認証情報の環境変数名が不正です。',
  'Use Credential env for authentication; do not store secret headers.':
    '認証には環境変数を指定し、シークレットをヘッダーに保存しないでください。',
  'Headers must be a JSON object with string values and valid header names.':
    'ヘッダーには、有効なヘッダー名と文字列の値を持つ JSON オブジェクトを指定してください。',
  'A cycle was found in the tree.': 'ツリー内に循環参照があります。',
  'Node is not connected to Root.': 'ノードが Root に接続されていません。',
  'Duplicate node IDs in project.': 'プロジェクト内のノード ID が重複しています。',
  'Project must contain exactly one enabled Root.': 'プロジェクトには有効な Root が 1 つ必要です。',
  'Duplicate connection IDs in project.': 'プロジェクト内の接続 ID が重複しています。',
  'Duplicate variable IDs in project.': 'プロジェクト内の変数 ID が重複しています。',
  'Project files must be 5 MiB or smaller.': 'プロジェクトファイルは 5 MiB 以下にしてください。',
  'The open workspace must be 20 MiB or smaller. Export your projects to keep a copy.':
    '開いているワークスペースは 20 MiB 以下にしてください。プロジェクトを書き出して保存できます。',
  'Duplicate document IDs in workspace.': 'ワークスペース内のドキュメント ID が重複しています。',
  'The active document is missing from workspace.':
    'ワークスペースに選択中のドキュメントが存在しません。',
  'Project limit exceeded.': 'プロジェクトの上限を超えています。',
  'Desktop file bridge is unavailable.': 'デスクトップのファイル連携を利用できません。',
  'Desktop file bridge could not be loaded.': 'デスクトップのファイル連携を読み込めませんでした。',
  'Invalid project file.': 'プロジェクトファイルが不正です。',
  'The editor was closed.': 'エディターが閉じられました。',
  'The desktop file operation timed out.': 'デスクトップのファイル操作がタイムアウトしました。',
  'Export files must be 20 MiB or smaller.': '書き出すファイルは 20 MiB 以下にしてください。',
  'The native request is empty or too large.': 'ネイティブ操作の要求が空か、大きすぎます。',
  'The native request is not valid JSON.': 'ネイティブ操作の要求が有効な JSON ではありません。',
  'The native request must be an object.': 'ネイティブ操作の要求はオブジェクトにしてください。',
  'The native request needs a valid request ID.':
    'ネイティブ操作の要求には有効なリクエスト ID が必要です。',
  'This native operation is not supported.': 'このネイティブ操作には対応していません。',
  'Saving a file requires its name and text content.':
    'ファイルの保存にはファイル名とテキストが必要です。',
  'Files must be no larger than 20 MiB.': 'ファイルは 20 MiB 以下にしてください。',
  'The file contains invalid Unicode text.': 'ファイル内に不正な Unicode 文字があります。',
  'Projects must be no larger than 5 MiB.': 'プロジェクトは 5 MiB 以下にしてください。',
  'Choose a project saved as UTF-8 JSON.':
    'UTF-8 の JSON 形式で保存されたプロジェクトを選択してください。',
  'The selected file is not a valid JSON project object.':
    '選択したファイルは有効な JSON プロジェクトではありません。',
  'Choose a .json, .cs, or .txt file name.':
    'ファイル名の拡張子は .json、.cs、.txt のいずれかにしてください。',
  'The native request could not be read.': 'ネイティブ操作の要求を読み取れませんでした。',
  'A file dialog is already open.': 'ファイルダイアログがすでに開いています。',
  'The project could not be opened. Choose a readable UTF-8 JSON file.':
    'プロジェクトを開けませんでした。読み取り可能な UTF-8 の JSON ファイルを選択してください。',
  'The file could not be saved. Choose another location and try again.':
    'ファイルを保存できませんでした。別の保存先を選択して再試行してください。',
  'The file operation was cancelled.': 'ファイル操作がキャンセルされました。',
  'File operation failed.': 'ファイル操作に失敗しました。',
  'Invalid project': 'プロジェクトが不正です',
  'Could not create a tree.': 'ツリーを作成できませんでした。',
  'The C# runtime could not be loaded.': 'C# ランタイムを読み込めませんでした。',
  'Handler arguments must be a JSON array.': 'ハンドラーの引数は JSON 配列で指定してください。',
  'Only primitive handler arguments are supported.':
    'ハンドラーの引数にはプリミティブ値のみ指定できます。',
  'Code generation failed': 'コードの生成に失敗しました',
  'Simulation requires a tree with unique node IDs.':
    'シミュレーションにはノード ID が重複しないツリーが必要です。',
  'Invalid shared variable.': '共有変数が不正です。',
  'Unhandled exception': '未処理の例外',
  'Simulation delta must be a finite, nonnegative number.':
    'シミュレーションの経過時間には 0 以上の有限の数値を指定してください。',
  'Choose an Action, Condition, or mocked Workflow node.':
    'Action、Condition、またはモック対応の Workflow ノードを選択してください。',
  'Invalid mock status.': 'モックの状態が不正です。',
  'Boolean conditions and validators cannot return Running.':
    '真偽値を返す条件と検証ノードには Running を指定できません。',
  'Saved workspace could not be restored. Your saved data has been preserved.':
    '保存済みのワークスペースを復元できませんでした。保存データは保持されています。',
  'Resolve validation errors before simulation.':
    'シミュレーションの前に検証エラーを修正してください。',
  'All open trees saved locally.': '開いているすべてのツリーをローカルに保存しました。',
  'Local storage is unavailable. Export JSON to save your project.':
    'ローカル保存を利用できません。JSON を書き出してプロジェクトを保存してください。',
  'C# generated successfully.': 'C# コードを生成しました。',
  'Selection copied.': '選択項目をコピーしました。',
  'Connection rejected: check parent, capacity, and cycles.':
    '接続できません。親ノード、接続数の上限、循環参照を確認してください。',
  'C# copied to clipboard.': 'C# コードをクリップボードにコピーしました。',
  'Clipboard is unavailable. Download the C# file instead.':
    'クリップボードを利用できません。C# ファイルをダウンロードしてください。',
  'Mode changed. All nodes and settings are preserved.':
    'モードを変更しました。すべてのノードと設定は保持されています。',
  'Tree is valid.': 'ツリーに問題はありません。',
  'Enemy AI sample loaded. Undo restores your previous tree.':
    '敵 AI のサンプルを読み込みました。元に戻す操作で以前のツリーを復元できます。',
  'Order processing sample loaded. Undo restores your previous tree.':
    '注文処理のサンプルを読み込みました。元に戻す操作で以前のツリーを復元できます。',
};

const nodeLabels = new Set([
  'Root',
  'Sequence',
  'Selector',
  'Parallel',
  'Inverter',
  'Repeater',
  'Retry',
  'Timeout',
  'Condition',
  'Action',
  'Wait',
  'Cooldown',
  'Random Selector',
  'Random Sequence',
  'Blackboard Check',
  'Set Blackboard',
  'Async Action',
  'HTTP Request',
  'Delay',
  'Validate',
  'Transform',
  'Log',
  'Exception Handler',
  'Set Context',
  'Context Check',
]);
const numericLabels: Readonly<Record<string, string>> = {
  Seconds: '秒数',
  'Repeat count': '繰り返し回数',
  Attempts: '試行回数',
  'Success threshold': '成功のしきい値',
  'Failure threshold': '失敗のしきい値',
  'HTTP timeout': 'HTTP タイムアウト',
};
const number = '-?\\d+(?:\\.\\d+)?';
const numericParameter = new RegExp(
  `^(Seconds|Repeat count|Attempts|Success threshold|Failure threshold|HTTP timeout) must be (an integer )?between (${number}) and (${number})\\.$`,
);

/**
 * Returns undefined for unknown text rather than guessing at user-authored content.
 * All dynamic matches cover a complete, known diagnostic template; captures are retained.
 */
export function translateDiagnostic(message: string): string | undefined {
  return translateKnownDiagnostic(message, 0);
}

function translateKnownDiagnostic(message: string, depth: number): string | undefined {
  if (Object.hasOwn(exact, message)) return exact[message];
  if (depth >= 8) return undefined;
  let match: RegExpMatchArray | null;

  if ((match = message.match(/^Variable “([\s\S]*)” must be a valid C# identifier\.$/)))
    return `変数 “${match[1]}” には有効な C# 識別子を指定してください。`;
  if ((match = message.match(/^Variable “([\s\S]*)” is defined more than once\.$/)))
    return `変数 “${match[1]}” が複数定義されています。`;
  if (
    (match = message.match(
      /^Default value for “([\s\S]*)” is not a valid (bool|int|float|string|Vector3)\.$/,
    ))
  )
    return `“${match[1]}” の初期値は有効な ${match[2]} ではありません。`;
  if ((match = message.match(numericParameter)))
    return `${numericLabels[match[1]]}は ${match[3]} から ${match[4]} までの${match[2] ? '整数' : '数値'}にしてください。`;
  if (
    (match = message.match(/^(.+) is unavailable in (Game AI|Workflow)\.$/)) &&
    nodeLabels.has(match[1])
  )
    return `${match[1]} は ${match[2] === 'Game AI' ? 'ゲーム AI' : 'ワークフロー'} では使用できません。`;
  if (
    (match = message.match(/^(.+) requires (at least )?(\d+) child(?:ren)?\.$/)) &&
    nodeLabels.has(match[1])
  )
    return `${match[1]} には子ノードが ${match[3]} 個${match[2] ? '以上' : ''}必要です。`;
  if ((match = message.match(/^Handler “([\s\S]*)” is used for incompatible return types\.$/)))
    return `ハンドラー “${match[1]}” が互換性のない戻り値の型で使用されています。`;
  if ((match = message.match(/^Variable “([\s\S]*)” is not defined\.$/)))
    return `変数 “${match[1]}” が定義されていません。`;
  if ((match = message.match(/^Value must be a valid (bool|int|float|string|Vector3)\.$/)))
    return `有効な ${match[1]} の値を指定してください。`;
  if ((match = message.match(/^Projects support up to (\d+) (nodes|connections|variables)\.$/))) {
    const label = { nodes: 'ノード', connections: '接続', variables: '変数' }[match[2]];
    return `プロジェクトの${label}は ${match[1]} 個までです。`;
  }
  if ((match = message.match(/^Trees support up to (\d+) levels\.$/)))
    return `ツリーは ${match[1]} 階層までです。`;
  if ((match = message.match(/^A workspace supports up to (\d+) open projects\.$/)))
    return `同時に開けるプロジェクトは ${match[1]} 個までです。`;
  if ((match = message.match(/^Handler ([A-Za-z_][A-Za-z0-9_]*) has conflicting return types\.$/)))
    return `ハンドラー ${match[1]} の戻り値の型が競合しています。`;
  if ((match = message.match(/^Undefined variable ([\s\S]*)\.$/)))
    return `変数 ${match[1]} が定義されていません。`;
  if ((match = message.match(/^Invalid (bool|int|float|string|Vector3) value for ([\s\S]*)\.$/)))
    return `${match[2]} の値は有効な ${match[1]} ではありません。`;

  if ((match = message.match(/^(Open|Save|Import) failed: ([\s\S]*)$/))) {
    const operation = { Open: '開く操作', Save: '保存', Import: '読み込み' }[match[1]];
    return `${operation}に失敗しました: ${translateKnownDiagnostic(match[2], depth + 1) ?? match[2]}`;
  }
  if ((match = message.match(/^Generated ([\s\S]+\.cs) · (\d+) nodes · (Game AI|Workflow)$/)))
    return `生成: ${match[1]} · ${match[2]} ノード · ${match[3] === 'Game AI' ? 'ゲーム AI' : 'ワークフロー'}`;
  if ((match = message.match(/^Added (.+)$/)) && nodeLabels.has(match[1]))
    return `追加: ${match[1]}`;
  if ((match = message.match(/^(Imported|Saved) ([\s\S]+)$/)))
    return `${match[1] === 'Imported' ? '読み込み' : '保存済み'}: ${match[2]}`;
  if ((match = message.match(/^(\d+) (?:error needs|errors need) attention\.$/)))
    return `${match[1]} 件のエラーを確認してください。`;
  if ((match = message.match(/^(\d+) errors found\.$/)))
    return `${match[1]} 件のエラーがあります。`;
  if ((match = message.match(/^Validation: (\d+) errors, (\d+) warnings$/)))
    return `検証: エラー ${match[1]} 件、警告 ${match[2]} 件`;

  // Preserve the tick prefix, node names, variables and enum values verbatim.
  // Do not recursively translate arbitrary Log-node text after a tick prefix.
  if ((match = message.match(/^(\[\d+\] )Tick (\d+): (Success|Failure|Running)$/)))
    return `${match[1]}ステップ ${match[2]}: ${match[3]}`;
  if ((match = message.match(/^(\[\d+\] )([\s\S]*): invalid mock result\.$/)))
    return `${match[1]}${match[2]}: モックの戻り値が不正です。`;
  if ((match = message.match(/^(\[\d+\] )([\s\S]*): undefined variable ([\s\S]*)\.$/)))
    return `${match[1]}${match[2]}: 変数 ${match[3]} が定義されていません。`;
  if (
    (match = message.match(
      /^(\[\d+\] )Invalid (bool|int|float|string|Vector3) value for ([\s\S]*)\.$/,
    ))
  )
    return `${match[1]}${match[3]} の値は有効な ${match[2]} ではありません。`;

  // toAst reports multiple validation diagnostics separated by newlines.
  if (message.includes('\n')) {
    const lines = message.split('\n').map((line) => translateKnownDiagnostic(line, depth + 1));
    if (lines.every((line): line is string => line !== undefined)) return lines.join('\n');
  }
  return undefined;
}
