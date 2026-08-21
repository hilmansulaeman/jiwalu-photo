Unicode True
Name "Urbanmen Photo Camera Agent"
OutFile "../../backend/dist/UrbanmenPhoto-Camera-Agent-Setup.exe"
InstallDir "$LOCALAPPDATA\Urbanmen Photo Camera Agent"
RequestExecutionLevel user
SetCompressor /SOLID lzma

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Camera Agent" SecMain
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File "../../backend/dist/camera-agent.exe"
  File /oname=README-WINDOWS.txt "../../backend/cmd/camera-agent/README-WINDOWS.txt"

  IfFileExists "$INSTDIR\camera-agent.env" config_exists
  File /oname=camera-agent.env "../../backend/dist/camera-agent.env.example"
config_exists:

  WriteUninstaller "$INSTDIR\uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Urbanmen Photo"
  CreateShortcut "$SMPROGRAMS\Urbanmen Photo\Camera Agent.lnk" "$INSTDIR\camera-agent.exe" "" "$INSTDIR\camera-agent.exe" 0
  CreateShortcut "$DESKTOP\Urbanmen Photo Camera Agent.lnk" "$INSTDIR\camera-agent.exe" "" "$INSTDIR\camera-agent.exe" 0
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$SMPROGRAMS\Urbanmen Photo\Camera Agent.lnk"
  RMDir "$SMPROGRAMS\Urbanmen Photo"
  Delete "$DESKTOP\Urbanmen Photo Camera Agent.lnk"
  Delete "$INSTDIR\camera-agent.exe"
  Delete "$INSTDIR\README-WINDOWS.txt"
  Delete "$INSTDIR\uninstall.exe"
  ; Keep camera-agent.env so reinstalling does not erase the user's secrets.
  RMDir "$INSTDIR"
SectionEnd
