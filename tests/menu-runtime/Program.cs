using System.Globalization;
using System.Text.Json;
using STW.Menu;
using STW.Menu.Bytecode;
using STW.Menu.Features.Blueprints;
using STW.Menu.Presentation;
using STW.Installer.Storage;

var ui = MenuInterface.Create();
var sections = new HomebaseLibraryFeature(ui.Metadata().CreateAsset(), ui).Sections().ToDictionary();
sections["Homebase.Remember"] = [];
foreach (string file in args)
{
    string payload = HomebaseSaveFile.Read(File.ReadAllBytes(file)).Value;
    var vm = new KeybindChecks.Vm(ui, sections, Path.GetTempPath());
    foreach (var p in ui.Functions[77].Properties)
        vm.State.TryAdd(p.Name.Text, p.Type.Text switch { "IntProperty" => 0, "BoolProperty" => false, "DoubleProperty" => 0d, "ArrayProperty" => new List<object>(), _ => "" });
    vm.Native[Symbols.Ref_Engine_KismetMathLibrary_Less_DoubleDouble.Index] = a => (double)a[0] < (double)a[1];
    vm.Native[ui.CaptureImports["Concat"]] = a => (string)a[0] + (string)a[1];
    vm.Native[ui.CaptureImports["EqualString"]] = a => Equals(a[0], a[1]);
    vm.Native[ui.CaptureImports["Replace"]] = a => ((string)a[0]).Replace((string)a[1], (string)a[2], StringComparison.Ordinal);
    vm.Native[ui.CaptureImports["JoinStrings"]] = a => string.Join((string)a[1], (List<object>)a[0]);
    vm.Native[ui.CaptureImports["StringToDouble"]] = a => double.Parse((string)a[0], CultureInfo.InvariantCulture);
    vm.Native[ui.CaptureImports["IntToString"]] = a => Convert.ToInt32(a[0]).ToString(CultureInfo.InvariantCulture);
    vm.Native[ui.CaptureImports["IntToDouble"]] = a => Convert.ToDouble(a[0]);
    vm.Native[ui.CaptureImports["TruncateDouble"]] = a => (int)(double)a[0];
    vm.Native[ui.CaptureImports["ByteToInt"]] = a => Convert.ToInt32(a[0]);
    vm.Native[ui.CaptureImports["EqualDouble"]] = a => Convert.ToDouble(a[0]) == Convert.ToDouble(a[1]);
    vm.Native[ui.HomebaseImports["Numeric"]] = a => System.Text.RegularExpressions.Regex.IsMatch((string)a[0], @"\A[+-]?(?:\d+(?:\.\d*)?|\.\d+)\z");
    vm.Native[ui.HomebaseImports["EqualInt"]] = a => (int)a[0] == (int)a[1];
    vm.Native[ui.HomebaseImports["Parse"]] = a => ((string)a[0]).Split((string)a[1], StringSplitOptions.None).Cast<object>().ToList();
    vm.Native[ui.HomebaseImports["Int"]] = a => int.TryParse((string)a[0], out var n) ? n : 0;
    vm.Native[ui.RequirementsImports["Lower"]] = a => ((string)a[0]).ToLowerInvariant();
    vm.Native[ui.HomebaseImports["QuatRotator"]] = a => new Dictionary<string, object> { { "Pitch", 0d }, { "Yaw", 0d }, { "Roll", 0d } };
    vm.Native[Symbols.Ref_Engine_KismetMathLibrary_Multiply_DoubleDouble.Index] = a => (double)a[0] * (double)a[1];
    vm.Native[ui.CaptureImports["SetArrayElement"]] = a => { var list = (List<object>)a[0]; int i = (int)a[1]; while (list.Count <= i) list.Add(0); list[i] = a[2]; return false; };
    vm.Native[Symbols.Ref_Engine_KismetSystemLibrary_MakeSoftObjectPath.Index] = a => a[0];
    vm.Native[Symbols.Ref_Engine_KismetSystemLibrary_Conv_SoftObjPathToSoftObjRef.Index] = a => a[0];
    vm.NativeMethods[ui.SetPreviewTextureImport] = (_, _) => false;
    var rows = payload.Split('\n');
    vm.State["Ui_HBRows"] = rows.Cast<object>().ToList(); vm.State["Ui_HBDocument"] = rows[1];
    vm.State["Ui_HBLoading"] = true; vm.State["Ui_HBCursor"] = 2; vm.State["Ui_HBDynamic"] = true;
    vm.State["Ui_HBTotals"] = Enumerable.Repeat<object>(0, Math.Max(4, ui.RequirementIconPaths.Count)).ToList();
    int ticks = 0; while ((bool)vm.State["Ui_HBLoading"] && ++ticks < 10000) vm.Run("Homebase.LoadTick");
    var order = (List<object>)vm.State["Ui_BRBuildOrder"];
    int expected = rows.Length - 2;
    if (order.Count != expected) throw new InvalidDataException($"{Path.GetFileName(file)}: build queue {order.Count}/{expected}; {vm.State["Ui_HBStatus"]}");
    using var document = JsonDocument.Parse(rows[1]);
    var records = document.RootElement.GetProperty("placements").EnumerateArray().ToArray();
    var poses = (List<object>)vm.State["Ui_HBPoses"];
    for (int i = 0; i < expected; i++)
    {
        var pose = (object[])poses[i];
        foreach (var (source, target, axes) in new[] { ("translation", 1, new[] { "X", "Y", "Z" }), ("rotation", 0, new[] { "X", "Y", "Z", "W" }), ("scale", 2, new[] { "X", "Y", "Z" }) })
        {
            var values = records[i].GetProperty("transform").GetProperty(source).EnumerateArray().Select(n => n.GetDouble()).ToArray();
            var decoded = (object[])pose[target];
            for (int j = 0; j < axes.Length; j++) if ((double)decoded[j] != values[j]) throw new InvalidDataException($"Row {i + 1}: runtime changed {source}.{axes[j]}");
            if (source == "translation")
            {
                var buildPosition = (object[])((List<object>)vm.State["Ui_BRPositions"])[i];
                if (!buildPosition.SequenceEqual(decoded)) throw new InvalidDataException($"Row {i + 1}: builder position differs from decoded pose");
            }
        }
    }
    foreach (string blocked in new[] { rows[1].Replace("\"numericRoundTripFailures\":0,", ""), rows[1].Replace("\"numericRoundTripFailures\":0,", "\"numericRoundTripFailures\":1,") })
    {
        vm.State["Ui_HBDocument"] = blocked;
        vm.State["Ui_BRBuildOrder"] = Enumerable.Range(0, expected).Cast<object>().ToList();
        vm.Run("Homebase.Verification");
        if (((List<object>)vm.State["Ui_BRBuildOrder"]).Count != 0) throw new InvalidDataException("Regression: missing/failed precision must block dispatch");
    }
    Console.WriteLine($"PASS: {Path.GetFileName(file)}: emitted menu loader retains {order.Count} build entries and exact actor poses.");
}
