# N52832 Firmware

## Device Description

The N52832 is part of the "Diamond" display device that sits on the handlebars of the ebike. The display device has a Bluetooth interface that interacts with a phone app. The phone app is able to update settings on the Diamond, as well as get data from it about the bike. The Diamond is also contains a CAN bus interface, however the N52832 communicates with an STM chip on the same PCB over UART to actually talk to the CAN bus.

Via the CAN bus, the Diamond talks with the motor controller to change settings such as the Drive mode and Assist level. It is also able to send firmware updates to the motor controller from the phone app by using the buttonless DFU mode.

The N52832 is also able to send updates to the STM chip via the DFU method. To do this, it saves the firmware to an IS SPI memory chip on the Diamond PCB, then updates the STM chip over UART.

This device can set various settings to the motor controller: Assist, Mode, Light. The mode changes based on what country (US or EU) the motor controller is set to.

## Hardware
Chip: N52832
Flash size: 512 kB
Write Granularity: 32-bit words (aligned)
Erase Granularity: 4 kB pages (or full chip erase)

## Software
SDK: v14.2.0
SoftDevice: 0xa5, S132 v5.1.0
Compiler: gcc-arm-none-eabi-4_9-2015q3 (maybe)
Type: Little-endian

## Firmware Segments
0x0 - 0x22fff: SoftDevice
0x73000 - 0x80000: Bootloader (RX)
0x23000 - +$APP_SIZE: Application Code (RX/R)
0x7f000 - 0x7f164: Bootloader settings (nrf_dfu_settings_t)
0x10001000 - 0x1000120C: UICR Settings (~1kb)

$APP_SIZE is stored in the nrf_dfu_settings_t structure, in bank_0 or bank_1.

For version 6-221122-0:
App image size: 0x24fac
0x23000 - ~0x39fdc: Application Code (RX)
~0x39fde - 0x47fac: Application Data (R)
0x47fad - 0x72fff: Writable data (RW)

## RAM
RAM access is from 0x20000000 to 0x20010000
