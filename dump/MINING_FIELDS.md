# Mining data map (from dump.cs, game build 2026-09-01)

Full dump: `C:\DEV\STFC\dump\dump.cs` (47 MB). Search it with grep.

## Where to start
`FleetsManager` (Assembly-CSharp, `Digit.Prime.FleetManagement`) is a MonoSingleton.
- `FleetPlayerData GetFleetPlayerData(int fleetIndex)` — your ships, index 0..N
- `int GetSelectedFleetIndex()`, `FleetPlayerData GetSelectedFleetData()`

## FleetPlayerData (Digit.PrimeServer.Models, TypeDefIndex 8281) — one of YOUR ships
| Want | Property | Type |
|---|---|---|
| Is mining? | `IsMining` | bool |
| State | `CurrentState` | FleetState (Mining = 4) |
| Where | `Address` | NodeAddress {galaxy, system, planet, instance} |
| Ship | `Hull.Name`, `HullId`, `Tier` | |
| Mining slot | `MiningData` | MiningSlot (see below) |
| Cargo hold | `CargoHoldData` | CargoHoldData (see below) |
| Cargo contents | `Cargo.Resources` | Dictionary<long resourceId, long amount> |
| Cargo fill % | `CargoResourceFillLevel` | float |
| Rate (buffed) | `GetMiningRate()` | float |

## MiningSlot (TypeDefIndex 8409) — via `FleetPlayerData.MiningData`
| Want | Property | Type |
|---|---|---|
| What resource | `ResourceId` | long |
| Rate per hour | `PerHourRate` | long |
| Rate per second | `PerSecondRate` | float |
| Mined so far | `AmountMined` | double |
| Node total | `PointData.Amount` | long |
| Node base rate | `PointData.Rate` | long |
| Node level | `PointData.Level` | int |
| Progress | `CurrentValue` / `MaxValue` | double |
| Time left | `RemainingTime` | TimeSpan |
| Start / due | `StartTime` / `DueTime` | DateTime |
| Active | `IsActive` | bool |

"Left to mine" = `PointData.Amount - AmountMined` (or `MaxValue - CurrentValue`).

## CargoHoldData (TypeDefIndex 8267) — via `FleetPlayerData.CargoHoldData`
| Want | Property | Type |
|---|---|---|
| Cargo now / max | `CurrentCargo.CurrentValue` / `.MaxValue` | double |
| Protected now / max | `ProtectedCargoProgress.CurrentValue` / `.MaxValue` | double |
| Unprotected | `UnprotectedCargoProgress` | ProgressData |
| Protected % | `ProtectedCargoPercentage` | float |

## Node side (other players too)
- `MiningService` (GSService) has `MiningNodeData GetCachedNodeData(long nodeId)`
- `MiningNodeData.MiningSlots` → List<MiningSlotData>
- `MiningSlotData`: `CurrentState` (Unoccupied/Occupied/OccupiedAndMining/Depleted), `Rate`, `DockedFleet` (FleetDeployedData), `UserProfile`, `FleetCollectedAmount`, `SlotResourceData`

## Server proto (already tapped by sync.cc)
- `DeployedFleet` message: `state`, `nodeId`, `nodeAddress`, `shipIds`, `attributes`/`stats` maps
- Modifier ids: ModMiningRate=105, ModCargoCapacity=66, ModCargoProtection=67
