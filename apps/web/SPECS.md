This file details the feature specifications for this website.

# Technology

This is an AstroJS static, multi-page site. Pages do not need to share any data. For interactive parts, this site uses SolidJS. For styling, this site uses Tailwind. The core functionality depends on WebUSB, and because of this, it only needs to work on Chrome-based browsers. An error page should block usage unless WebUSB is available.

# Pages

## Index/main page
- Get a DAPLink
- Open up display
- Open website
	- Accept warning, donate data option
	- Instructions, with inline buttons
	- Select USB device
	- Backup section
		- Generate unique ID for sharing in Discord (if donating)
			- Should ID allow downloading?
			- ID is SHA3-224 of flash.bin + uicr.bin
		- Click 'Arm' toggle, app starts attempting to dump backup firmware
		- Backup report, with backup download (can we make it a zip?)
		- Warnings for unknown FW dump/or locked device 🚧
			- For unknown/unsupported FW, textbox with "I'm Crazy" to keep going
	- Skeleton Key section
		- Another warning, cus why not
			- No longer work with official app
		- Click "Arm" toggle, app again starts search
		- Once connected, do a read, confirm with last read, then initiate erase, then flash SK, then verify
		- Prompt for power cycle
	- Done!
		- Close display back up
		- Delete any old bluetooth bonds from phone
		- Donate button?
- Advanced/dev mode?
- Allow backup download from ID?

## Advanced page (/advanced)

A single page with a warning on top indicating it's for advanced users only. This page is basically the index page, but has each tool available for independent use.

Sections
- USB Probe Select
- Read Info
- Backup tool
- Restore


# Tools

Each tool is an independent section on a page.

## USB Probe Select
  - A selection area that lets the user select the USB probe device to use for the rest of the tools. Should be reactive to when USB devices are plugged in and removed. Other sections are disabled until a device is selected. Should make some attempt to filter only DAPLink-compatible devices.

## Backup

Allows the user to backup a device their probe is connected to.

### Procedure
  - Has an "Arm" button that when clicked, initiates the backup procedure. While armed, other tools are disabled. Let user "Unarm" if they want to cancel the backup.
  - Backup procedure
    - Attempt to read device info from the target with the USB probe. Retry on error, but display most recent error on the interface. If a read is successful, move to the next step.
    - Present the read info to the user inline on the page.
    - Initiate a full backup of the device, how this backup is done depends on the info read in the previous step.
    - As backup is being done, give user feedback on percentage done.
    - Once backup is done, save data to the specified files as dictated in the target device config.
    - Run another backup in order to verify a clean backup was made
    - Compare the two backups for validation.
    - Also validate backup size, and any other info we can match with the initial read data.
    - If validation is successful, show all the gathered information inline. 
      - Show the details of the initial read.
      - Allow the user to download the files as a .zip archive. The archive name should include the chip type and a timestamp.
      - Add a 'Reset' button to reset this section to its original state.
    - If validation or backup is unsuccessful:
      - Show whatever information we were able to get, along with the error.
      - If files were generated, allow the user to download them for inspection
      - Add a 'Reset' button to reset this section to its original state.

## Read Info

Allows the user to read the info from their target. Info changes depending on the chip that's identified

### Procedure

  - Has an "Arm" button that initiates the procedure
  - Attempt to read from the chip, if there's an error, present the error and try again. Retry until successful, or the user cancels.
  - If success, present all the information, unarm.

  
## Restore

Allows user to flash their chip using a backup or custom firmware, then verify.

### Procedure
- Has a menu of firmware packages for the user to select. If a backup has been taken, then that is there. Also a button the allows the user to upload zip files from previous backups or custom firmware. For the n53, the zip needs to include a flash.bin and a uicr.bin. Shows the name of the zip for easy selection.
- Has an "Arm" button that initiates the procedure, disabled if a firmware package has not been selected.
- Attempt to read from the chip, if there's an error, present the error and try again. Retry until successful, or the user cancels.
- If success, initiate the flash procedure, making sure to give the user feedback on progress
- If success, read flash from the device to verify restore was successful
