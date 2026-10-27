using System.Text.Json;
using CUE4Parse.FileProvider;
using CUE4Parse.UE4.Versions;
using CUE4Parse.UE4.Objects.Core.Misc;
using CUE4Parse.Encryption.Aes;
using CUE4Parse.MappingsProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.Compression;
using CUE4Parse.UE4.Assets.Exports.StaticMesh;
using CUE4Parse_Conversion;
using CUE4Parse_Conversion.Options;

if (args.Length < 3) throw new ArgumentException("Usage: TrapExport <installed Paks directory> <matching usmap> <output directory> [--list|--blueprints|--ammo]");
var paks = Path.GetFullPath(args[0]); var mapping = Path.GetFullPath(args[1]); var root = Path.GetFullPath(args[2]);
if (root.Equals(paks, StringComparison.OrdinalIgnoreCase) || root.StartsWith(paks + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Output must be outside the installed game archives.");
Directory.CreateDirectory(root);
await OodleHelper.InitializeAsync(Path.Combine(root, "oodle-data-shared.dll"));
var provider = new DefaultFileProvider(paks, SearchOption.TopDirectoryOnly, new VersionContainer(EGame.GAME_UE5_8), StringComparer.OrdinalIgnoreCase);
provider.MappingsContainer = new FileUsmapTypeMappingsProvider(mapping);
provider.Initialize();
using var client = new HttpClient(); using var keys = JsonDocument.Parse(await client.GetStringAsync("https://fortnite-api.com/v2/aes"));
provider.SubmitKey(new FGuid(), new FAesKey(keys.RootElement.GetProperty("data").GetProperty("mainKey").GetString()!));
provider.PostMount();
Console.WriteLine($"Indexed {provider.Files.Count} assets");
if (args.Contains("--build-edits"))
{
    foreach (var f in provider.Files.Values.Where(f => f.Path.EndsWith(".uasset") && (System.Text.RegularExpressions.Regex.IsMatch(f.Path, @"/PBWA_[WSM][123]_", System.Text.RegularExpressions.RegexOptions.IgnoreCase) || f.Path.Contains("EditMode", StringComparison.OrdinalIgnoreCase) && f.Path.Contains("Building", StringComparison.OrdinalIgnoreCase))))
    {
        try { File.WriteAllText(Path.Combine(root, Path.GetFileNameWithoutExtension(f.Path) + ".json"), Newtonsoft.Json.JsonConvert.SerializeObject(provider.LoadPackage(f.Path).GetExports(), Newtonsoft.Json.Formatting.Indented)); Console.WriteLine(f.Path); } catch (Exception ex) { Console.WriteLine($"FAILED {f.Path}: {ex.Message}"); }
    }
    return;
}
if (args.Contains("--blueprints"))
{
    foreach (var f in provider.Files.Values.Where(f => f.Path.Contains("Items/Traps/Blueprints/Trap_Floor_") && f.Path.EndsWith(".uasset") && (f.Path.Contains("Health") || f.Path.Contains("AntiAir") || f.Path.Contains("Flame"))))
    {
        Console.WriteLine(f.Path);
        File.WriteAllText(Path.Combine(root, Path.GetFileNameWithoutExtension(f.Path) + ".json"), Newtonsoft.Json.JsonConvert.SerializeObject(provider.LoadPackage(f.Path).GetExports(), Newtonsoft.Json.Formatting.Indented));
    }
    return;
}
var matches = provider.Files.Values.Where(f => f.Path.Contains("HealthSquare", StringComparison.OrdinalIgnoreCase) || f.Path.Contains("Flame_Grill", StringComparison.OrdinalIgnoreCase) || f.Path.Contains("Patrol_Ward_Trap", StringComparison.OrdinalIgnoreCase) || f.Path.EndsWith("/SM_Turret_Gun_Ammo.uasset", StringComparison.OrdinalIgnoreCase)).ToArray();
foreach (var f in matches) Console.WriteLine(f.Path);
if (args.Contains("--list")) return;
var wanted = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "S_Floor_HealthSquare.uasset", "SM_Flame_Grill_Trap.uasset", "Patrol_Ward_Trap_base.uasset", "Patrol_Ward_Trap_core.uasset", "Patrol_Ward_Trap_turrethead.uasset", "SM_Turret_Gun_Ammo.uasset" };
if (args.Contains("--ammo")) wanted = ["SM_Turret_Gun_Ammo.uasset"];
foreach (var f in matches.Where(f => wanted.Contains(Path.GetFileName(f.Path))))
{
    try
    {
        var objects = provider.LoadPackage(f.Path).GetExports().ToArray();
        foreach (var mesh in objects.OfType<UStaticMesh>())
        {
            Console.WriteLine($"Exporting {mesh.Name}");
            var results = await new ExportSession().Add(mesh).RunAsync(root, new ExportOptions(meshFormat: EMeshFormat.Gltf2));
            Console.WriteLine(JsonSerializer.Serialize(results));
        }
    }
    catch (Exception ex) { Console.WriteLine($"FAILED {f.Path}: {ex.Message}"); }
}
