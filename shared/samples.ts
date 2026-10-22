// Sample code for each language. Tests use these.
export const SAMPLES: Record<string, string[]> = {
  powerquery: [
    `let
    Source = SharePoint.Tables("https://contoso.sharepoint.com/sites/ops", [Implementation="2.0"]),
    #"Filtered Rows" = Table.SelectRows(Source, each [Status] = "Active"),
    #"Changed Type" = Table.TransformColumnTypes(#"Filtered Rows", {{"Created", type datetime}})
in
    #"Changed Type"`,
    `= Table.AddColumn(#"Added Custom", "FY", each if Date.Month([Date]) >= 7 then Date.Year([Date]) + 1 else Date.Year([Date]))`,
  ],
  dax: [
    `Sales YTD =
VAR CurrentYear = MAX('Date'[Year])
RETURN
    CALCULATE(
        SUM(Sales[Amount]),
        DATESYTD('Date'[Date])
    )`,
    `Margin % = DIVIDE([Total Margin], [Total Sales])`,
    `EVALUATE
SUMMARIZECOLUMNS('Product'[Category], "Sales", SUM(Sales[Amount]))`,
  ],
  powerfx: [
    `Patch(
    Projects,
    LookUp(Projects, ID = ThisItem.ID),
    {
        Owner: {
            '@odata.type': "#Microsoft.Azure.Connectors.SharePoint.SPListExpandedUser",
            Claims: "i:0#.f|membership|" & User().Email,
            DisplayName: User().FullName,
            Email: User().Email
        }
    }
);
Notify("Saved", NotificationType.Success)`,
    `Set(varUser, Office365Users.MyProfileV2());
Navigate(scrHome, ScreenTransition.Fade)`,
    `Filter(Tasks, Status.Value = "Open" && AssignedTo.Email = User().Email)`,
  ],
  powerautomate: [
    `@{triggerBody()?['ID']}`,
    `{
  "__metadata": { "type": "SP.Data.ProjectsListItem" },
  "Title": "@{triggerOutputs()?['body/Title']}",
  "StatusId": "@{outputs('Get_status')?['body/value'][0]['ID']}"
}`,
    `formatDateTime(addDays(utcNow(), -7), 'yyyy-MM-dd')`,
    `{
  "Compose": {
    "type": "Compose",
    "inputs": "@variables('items')",
    "runAfter": {}
  }
}`,
  ],
  pyspark: [
    `from pyspark.sql import functions as F

df = spark.read.table("sales")
df = df.withColumn("year", F.year("order_date")).groupBy("year").agg(F.sum("amount").alias("total"))
display(df)`,
    `df.filter(F.col("status") == "active").write.mode("overwrite").saveAsTable("silver.customers")`,
  ],
  python: [
    `import requests

def get_items(url: str) -> list:
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    return resp.json()["value"]`,
    `for item in items:
    if item["status"] == "open":
        print(f"{item['id']}: {item['title']}")`,
  ],
  sql: [
    `SELECT c.CustomerID, SUM(o.Total) AS Total
FROM dbo.Customers c
INNER JOIN dbo.Orders o ON o.CustomerID = c.CustomerID
WHERE o.OrderDate >= '2024-01-01'
GROUP BY c.CustomerID
ORDER BY Total DESC;`,
    `UPDATE dbo.Projects SET Status = 'Closed' WHERE EndDate < GETDATE();`,
  ],
  json: [
    `{
  "name": "offcuts",
  "version": "1.0.0",
  "tags": ["a", "b"],
  "nested": { "ok": true }
}`,
    `[{"id": 1, "title": "One"}, {"id": 2, "title": "Two"}]`,
  ],
  yaml: [
    `services:
  offcuts:
    image: offcuts:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data`,
    `name: CI
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest`,
  ],
  powershell: [
    `Connect-PnPOnline -Url $siteUrl -Interactive
$items = Get-PnPListItem -List "Projects" -PageSize 500
$items | Where-Object { $_.FieldValues.Status -eq "Open" } | ForEach-Object { Write-Host $_.Id }`,
    `param(
    [string]$Path
)
if (Test-Path $Path) { Remove-Item $Path -Recurse -Force }`,
  ],
  javascript: [
    `const items = await fetch("/api/items").then((r) => r.json());
items.forEach((item) => console.log(item.title));`,
    `function add(a, b) {
  return a + b;
}
module.exports = { add };`,
  ],
  html: [
    `<!DOCTYPE html>
<html>
  <head><title>Test</title></head>
  <body><div class="box">Hello</div></body>
</html>`,
    `<div class="card">
  <h2>Title</h2>
  <p>Body text</p>
</div>`,
  ],
};
