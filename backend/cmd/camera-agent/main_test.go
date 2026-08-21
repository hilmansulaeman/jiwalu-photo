package main

import "testing"

func TestSerialFromSummary(t *testing.T) {
	tests := []struct {
		name    string
		summary string
		want    string
	}{
		{"serial number", "Camera summary:\nSerial Number: 1234567890\n", "1234567890"},
		{"serial", "serial: ABC-42\n", "ABC-42"},
		{"unknown", "Serial Number: unknown\n", ""},
		{"missing", "Model: Canon EOS\n", ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := serialFromSummary(test.summary); got != test.want {
				t.Fatalf("serialFromSummary() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestNewGPhotoCameraUsesSerialAsStableID(t *testing.T) {
	stable := newGPhotoCamera("Canon EOS", "usb:001,004", "1234567890")
	if stable.Port != "canon:1234567890" || stable.USBPort != "usb:001,004" || !stable.Stable {
		t.Fatalf("unexpected stable camera: %#v", stable)
	}

	temporary := newGPhotoCamera("Canon EOS", "usb:001,005", "")
	if temporary.Port != "usb:001,005" || temporary.Stable {
		t.Fatalf("unexpected temporary camera: %#v", temporary)
	}
}
