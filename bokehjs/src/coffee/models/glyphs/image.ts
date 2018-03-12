import {XYGlyph, XYGlyphView, XYGlyphData} from "./xy_glyph"
import {Arrayable} from "core/types"
import {DistanceSpec, NumberSpec} from "core/vectorization"
import {ColorMapper} from "../mappers/color_mapper"
import {LinearColorMapper} from "../mappers/linear_color_mapper"
import * as p from "core/properties"
import {max, concat} from "core/util/array"
import {Context2d} from "core/util/canvas"

// XXX: because ImageData is a global
export interface _ImageData extends XYGlyphData {
  _image: Arrayable<number>
  _dw: Arrayable<number>
  _dh: Arrayable<number>

  sw: Arrayable<number>
  sh: Arrayable<number>

  max_dw: number
  max_dh: number
}

export interface ImageView extends _ImageData {}

export class ImageView extends XYGlyphView {
  model: Image
  visuals: Image.Visuals

  protected image_data: Arrayable<ImageData | null>
  protected _width: Arrayable<number>
  protected _height: Arrayable<number>

  initialize(options: any): void {
    super.initialize(options)
    this.connect(this.model.color_mapper.change, () => this._update_image())
    this.connect(this.model.properties.global_alpha.change, () => this.renderer.request_render())
  }

  protected _update_image() {
    // Only reset image_data if already initialized
    if (this.image_data != null) {
      this._set_data()
      this.renderer.plot_view.request_render()
    }
  }

  protected _set_data(): void {
    if (this.image_data == null || this.image_data.length != this._image.length)
      this.image_data = new Array(this._image.length)

    if (this._width == null || this._width.length != this._image.length)
      this._width = new Array(this._image.length)

    if (this._height == null || this._height.length != this._image.length)
      this._height = new Array(this._image.length)

    for (let i = 0, end = this._image.length; i < end; i++) {
      let shape = []
      if (this._image_shape != null) {
        shape = this._image_shape[i]
      }

      let img
      if (shape.length > 0) {
        img = this._image[i]
        this._height[i] = shape[0]
        this._width[i] = shape[1]
      } else {
        img = concat(this._image[i])
        this._height[i] = this._image[i].length
        this._width[i] = this._image[i][0].length
      }

      let canvas
      if (this.image_data[i] != null && this.image_data[i].width === this._width[i] &&
                                        this.image_data[i].height === this._height[i]) {
        canvas = this.image_data[i]
      } else {
        canvas = document.createElement('canvas')
        canvas.width = this._width[i]
        canvas.height = this._height[i]
      }

      const ctx = canvas.getContext('2d')
      const image_data = ctx.getImageData(0, 0, this._width[i], this._height[i])
      const cmap = this.model.color_mapper
      const buf = cmap.v_map_screen(img, true)
      const buf8 = new Uint8Array(buf)
      image_data.data.set(buf8)
      ctx.putImageData(image_data, 0, 0)
      this.image_data[i] = canvas

      this.max_dw = 0
      if (this._dw.units === "data") {
        this.max_dw = max(this._dw)
      }
      this.max_dh = 0
      if (this._dh.units === "data") {
        this.max_dh = max(this._dh)
      }
    }
  }

  protected _map_data(): void {
    switch (this.model.properties.dw.units) {
      case "data": {
        this.sw = this.sdist(this.renderer.xscale, this._x, this._dw, 'edge', this.model.dilate)
        break
      }
      case "screen": {
        this.sw = this._dw
        break
      }
    }

    switch (this.model.properties.dh.units) {
      case "data": {
        this.sh = this.sdist(this.renderer.yscale, this._y, this._dh, 'edge', this.model.dilate)
        break
      }
      case "screen": {
        this.sh = this._dh
        break
      }
    }
  }

  protected _render(ctx: Context2d, indices: number[], {image_data, sx, sy, sw, sh}: _ImageData): void {
    const old_smoothing = ctx.getImageSmoothingEnabled()
    ctx.setImageSmoothingEnabled(false)

    ctx.globalAlpha = this.model.global_alpha

    for (const i of indices) {
      if (image_data[i] == null)
        continue

      if (isNaN(sx[i] + sy[i] + sw[i] + sh[i]))
        continue

      const y_offset = sy[i]

      ctx.translate(0, y_offset)
      ctx.scale(1, -1)
      ctx.translate(0, -y_offset)
      ctx.drawImage(image_data[i], sx[i]|0, sy[i]|0, sw[i], sh[i])
      ctx.translate(0, y_offset)
      ctx.scale(1, -1)
      ctx.translate(0, -y_offset)
    }

    ctx.setImageSmoothingEnabled(old_smoothing)
  }

  bounds() {
    const {bbox} = this.index
    bbox.maxX += this.max_dw
    bbox.maxY += this.max_dh
    return bbox
  }
}

// NOTE: this needs to be redefined here, because palettes are located in bokeh-api.js bundle
const Greys9 = () => [0x000000, 0x252525, 0x525252, 0x737373, 0x969696, 0xbdbdbd, 0xd9d9d9, 0xf0f0f0, 0xffffff]

export namespace Image {
  export interface Attrs extends XYGlyph.Attrs {
    image: NumberSpec
    dw: DistanceSpec
    dh: DistanceSpec
    global_alpha: number
    dilate: boolean
    color_mapper: ColorMapper
  }

  export interface Props extends XYGlyph.Props {
    image: p.NumberSpec
    dw: p.DistanceSpec
    dh: p.DistanceSpec
    global_alpha: p.Property<number>
    dilate: p.Property<boolean>
    color_mapper: p.Property<ColorMapper>
  }

  export interface Visuals extends XYGlyph.Visuals {}
}

export interface Image extends Image.Attrs {}

export class Image extends XYGlyph {

  properties: Image.Props

  constructor(attrs?: Partial<Image.Attrs>) {
    super(attrs)
  }

  static initClass(): void {
    this.prototype.type = 'Image'
    this.prototype.default_view = ImageView

    this.define({
      image:        [ p.NumberSpec       ], // TODO (bev) array spec?
      dw:           [ p.DistanceSpec     ],
      dh:           [ p.DistanceSpec     ],
      dilate:       [ p.Bool,      false ],
      global_alpha: [ p.Number,    1.0   ],
      color_mapper: [ p.Instance,  () => new LinearColorMapper({palette: Greys9()}) ],
    })
  }
}
Image.initClass()
