' Arranca WhatsApp en segundo plano (sin ventana negra).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
entry = scriptDir & "\src\index.js"

If Not fso.FileExists(entry) Then
  MsgBox "No se encontro src\index.js en:" & vbCrLf & scriptDir, 16, "WhatsApp consultorio"
  WScript.Quit 1
End If

sh.CurrentDirectory = scriptDir
' 0 = oculto, False = no esperar a que termine
sh.Run "node """ & entry & """", 0, False
