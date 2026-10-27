using System.Text.Json;
using STW.Core;
using STW.Installer.Storage;
foreach (string file in args)
{
    var bytes = File.ReadAllBytes(file); HomebaseSaveFile.Validate(bytes);
    var lines = HomebaseSaveFile.Read(bytes).Value.Split('\n');
    if (!lines[1].Contains("\"numericRoundTripFailures\":0,")) throw new InvalidDataException("Menu verification clears the build queue: missing or failed precision result.");
    int count = BlueprintCaptureFile.Validate(lines[1]); var issues = BlueprintCaptureFile.AttachmentIssues(lines[1]);
    if (issues.Count > 0) throw new InvalidDataException(string.Join("\n", issues));
    var replay = BlueprintCaptureFile.CreateReplayPlan(lines[1]);
    if (replay.Issues.Count > 0 || replay.WorldDependencies.Count > 0 || replay.Placements.Count != count) throw new InvalidDataException("Invalid replay plan");
    if (lines.Length - 2 != count) throw new InvalidDataException("Replay row count mismatch");
    for (int row = 2; row < lines.Length; row++)
    {
        var fields = lines[row].Split('|'); if (fields.Length != 17) throw new InvalidDataException($"Replay row {row - 1}: expected 17 fields.");
        foreach (int field in new[] { 11, 12 })
        {
            string pose = fields[field].Replace("%7C", "|").Replace("%0A", "\n").Replace("%0D", "\r").Replace("%25", "%");
            foreach (string token in new[] { "{", "}", "[", "]", "\"translation\":", "\"rotation\":", "\"scale\":", "\"" }) pose = pose.Replace(token, "");
            var values = pose.Split(','); if (values.Length != 10) throw new InvalidDataException($"Replay row {row - 1}: invalid pose layout.");
            foreach (string value in values)
            {
                if (value.StartsWith("binary64:")) { BlueprintCaptureNumbers.Decode(value); continue; }
                if (!System.Text.RegularExpressions.Regex.IsMatch(value, @"\A[+-]?(?:\d+(?:\.\d*)?|\.\d+)\z") || !double.TryParse(value, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double number) || !double.IsFinite(number))
                    throw new InvalidDataException($"Replay row {row - 1}: runtime rejects numeric token {value}.");
            }
        }
    }
    Console.WriteLine($"PASS: {Path.GetFileName(file)}: native .sav, {count} placements, support graph, replay plan.");
}
